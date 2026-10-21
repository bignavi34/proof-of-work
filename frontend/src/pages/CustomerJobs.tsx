import { useEffect, useState } from "react";
import JobEvidence from "../components/JobEvidence";

import { API_URL } from "../api/config";
interface Job {
  id: string;
  service_request_id: string;
  customer_id: string;
  technician_id: string | null;
  assigned_by: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

interface ServiceRequest {
  id: string;
  service_type: string;
  description: string;
  status: string;
}

interface Payment {
  id: string;
  job_id: string;
  amount_minor: number;
  currency: string;
  status: string;
  razorpay_order_id: string | null;
}

interface OrderResponse {
  payment_id: string;
  job_id: string;
  order_id: string;
  amount: number;
  currency: string;
  key_id: string;
  status: string;
}

interface RazorpaySuccess {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

interface RazorpayOptions {
  key: string;
  order_id: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  handler: (response: RazorpaySuccess) => void | Promise<void>;
  modal?: {
    ondismiss?: () => void;
  };
  theme?: {
    color?: string;
  };
}

interface RazorpayInstance {
  open: () => void;
  on: (
    event: "payment.failed",
    handler: (response: {
      error?: { description?: string };
    }) => void,
  ) => void;
}

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => RazorpayInstance;
  }
}

async function loadRazorpayScript(): Promise<void> {
  if (window.Razorpay) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-razorpay-checkout="true"]',
    );

    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener(
        "error",
        () => reject(new Error("Could not load Razorpay Checkout")),
        { once: true },
      );
      return;
    }

    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.dataset.razorpayCheckout = "true";
    script.onload = () => resolve();
    script.onerror = () =>
      reject(new Error("Could not load Razorpay Checkout"));
    document.body.appendChild(script);
  });

  if (!window.Razorpay) {
    throw new Error("Razorpay Checkout did not initialize");
  }
}

export default function CustomerJobs() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [payingJobId, setPayingJobId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function loadData() {
    setError("");

    const [jobsResponse, requestsResponse, paymentsResponse] =
      await Promise.all([
        fetch(`${API_URL}/jobs/my`, { credentials: "include" }),
        fetch(`${API_URL}/service-requests/my`, {
          credentials: "include",
        }),
        fetch(`${API_URL}/payments/my`, {
          credentials: "include",
        }),
      ]);

    if (!jobsResponse.ok || !requestsResponse.ok) {
      throw new Error("Could not load your jobs and service requests.");
    }

    setJobs(await jobsResponse.json());
    setRequests(await requestsResponse.json());

    // Payment history may be unavailable temporarily; do not block job history.
    if (paymentsResponse.ok) {
      setPayments(await paymentsResponse.json());
    }
  }

  useEffect(() => {
    void loadData()
      .catch((loadError: unknown) => {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Could not load your jobs.",
        );
      })
      .finally(() => setLoading(false));
  }, []);

  async function startPayment(job: Job) {
    setPayingJobId(job.id);
    setError("");
    setNotice("");

    try {
      const request = requests.find(
        (item) => item.id === job.service_request_id,
      );

      if (!request) {
        throw new Error("Could not find the service details for this job.");
      }

      if (!["AC Cleaning", "AC Repair"].includes(request.service_type)) {
        throw new Error(
          "Online payment is not configured for this service yet.",
        );
      }

      const orderResponse = await fetch(`${API_URL}/payments/orders`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_id: job.id }),
      });

      if (!orderResponse.ok) {
        const body = await orderResponse.json().catch(() => null);
        throw new Error(
          body?.detail ?? "Could not create the payment order.",
        );
      }

      const order: OrderResponse = await orderResponse.json();
      await loadRazorpayScript();

      if (!window.Razorpay) {
        throw new Error("Razorpay Checkout is unavailable.");
      }

      const checkout = new window.Razorpay({
        key: order.key_id,
        order_id: order.order_id,
        amount: order.amount,
        currency: order.currency,
        name: "Proof-of-Work",
        description: request.service_type,
        theme: { color: "#2563eb" },
        handler: async (response) => {
          try {
            const verifyResponse = await fetch(`${API_URL}/payments/verify`, {
              method: "POST",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                payment_id: order.payment_id,
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
              }),
            });

            const verification = await verifyResponse.json().catch(() => null);

            if (!verifyResponse.ok) {
              throw new Error(
                verification?.detail ?? "Payment verification failed.",
              );
            }

            if (verification?.status === "paid") {
              setNotice("Payment verified successfully.");
            } else {
              setNotice(
                "Checkout returned, but payment is not confirmed yet. Check your payment history shortly.",
              );
            }

            await loadData();
          } catch (verifyError) {
            setError(
              verifyError instanceof Error
                ? verifyError.message
                : "Could not verify payment.",
            );
          } finally {
            setPayingJobId(null);
          }
        },
        modal: {
          ondismiss: () => setPayingJobId(null),
        },
      });

      checkout.on("payment.failed", (response) => {
        setError(
          response.error?.description ??
            "Payment failed or was cancelled. You can retry.",
        );
        setPayingJobId(null);
      });

      checkout.open();
    } catch (paymentError) {
      setError(
        paymentError instanceof Error
          ? paymentError.message
          : "Could not start payment.",
      );
      setPayingJobId(null);
    }
  }

  const requestById = new Map(requests.map((item) => [item.id, item]));
  const paymentByJobId = new Map(payments.map((item) => [item.job_id, item]));
  const completedJobs = jobs.filter((job) => job.status === "completed");
  const activeJobs = jobs.filter((job) => job.status !== "completed");

  function renderJob(job: Job) {
    const request = requestById.get(job.service_request_id);
    const payment = paymentByJobId.get(job.id);
    const supportedService =
      request &&
      ["AC Cleaning", "AC Repair"].includes(request.service_type);
    const paid = payment?.status === "paid";

    return (
      <article className="request-item" key={job.id}>
        <div>
          <strong>{request?.service_type ?? "Service job"}</strong>
          <p>Job created {new Date(job.created_at).toLocaleString()}</p>
          {request && <p>{request.description}</p>}
          <p>
            <strong>Job status:</strong> {job.status}
          </p>
        </div>

        <span className={`status-badge status-${job.status}`}>
          <span />
          {job.status}
        </span>

        <div>
          {payment ? (
            <p>
              <strong>Payment:</strong> {payment.status} · {payment.currency}{" "}
              {(payment.amount_minor / 100).toLocaleString("en-IN", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </p>
          ) : (
            <p>Payment record not available.</p>
          )}

          {paid ? (
            <p>Payment complete</p>
          ) : supportedService ? (
            <button
              className="primary-button"
              type="button"
              disabled={payingJobId !== null}
              onClick={() => void startPayment(job)}
            >
              {payingJobId === job.id
                ? "Opening checkout..."
                : payment?.status === "created"
                  ? "Continue to payment"
                  : "Pay now"}
            </button>
          ) : (
            <p>Online payment is not configured for this service.</p>
          )}
        </div>

        <JobEvidence jobId={job.id} />
      </article>
    );
  }

  return (
    <main className="dashboard-container">
      <section className="welcome-section">
        <p className="eyebrow">Customer</p>
        <h1>My jobs</h1>
        <p>Track accepted services, completed work, evidence, AI reports, and payments.</p>
      </section>

      {error && (
        <section className="dashboard-card">
          <p className="error-message">{error}</p>
        </section>
      )}

      {notice && (
        <section className="dashboard-card">
          <p>{notice}</p>
        </section>
      )}

      {loading ? (
        <section className="dashboard-card">
          <p>Loading jobs...</p>
        </section>
      ) : (
        <>
          <section>
            <div className="welcome-section">
              <h2>Active Jobs</h2>
              <p>Jobs still in progress or awaiting completion.</p>
            </div>

            {activeJobs.length === 0 ? (
              <section className="dashboard-card">
                <p>No active jobs right now.</p>
              </section>
            ) : (
              <section className="request-list">
                {activeJobs.map(renderJob)}
              </section>
            )}
          </section>

          <section style={{ marginTop: "40px" }}>
            <div className="welcome-section">
              <h2>Completed Jobs</h2>
              <p>
                Review the work evidence and AI before/after comparison for
                completed services. Payment status is shown separately.
              </p>
            </div>

            {completedJobs.length === 0 ? (
              <section className="dashboard-card">
                <p>No completed jobs yet. Completed work will appear here.</p>
              </section>
            ) : (
              <section className="request-list">
                {completedJobs.map(renderJob)}
              </section>
            )}
          </section>

          {jobs.length === 0 && (
            <section className="dashboard-card" style={{ marginTop: "24px" }}>
              <h2>No jobs yet</h2>
              <p>
                Once the company accepts your service request, the job will
                appear here.
              </p>
            </section>
          )}
        </>
      )}
    </main>
  );
}

