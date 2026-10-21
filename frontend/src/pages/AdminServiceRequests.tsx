import { useEffect, useState } from "react";
import { API_URL } from "../api/config";
interface ServiceRequest {
  id: string;
  customer_id: string;
  service_type: string;
  description: string;
  address: string;
  preferred_date: string | null;
  preferred_time: string | null;
  status: string;
  created_at: string;
}

export default function AdminServiceRequests() {
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [processingId, setProcessingId] = useState<string | null>(
    null,
  );

  async function loadRequests() {
    try {
      setError("");

      const response = await fetch(
       `${API_URL}/admin/service-requests`,
        {
          credentials: "include",
        },
      );

      if (!response.ok) {
        const body = await response.text();

        throw new Error(
          `Failed to load requests (${response.status}): ${body}`,
        );
      }

      setRequests(await response.json());
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Failed to load service requests",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadRequests();
  }, []);

  async function handleAccept(id: string) {
    setProcessingId(id);
    setError("");

    try {
      const response = await fetch(
        `${API_URL}/admin/service-requests/${id}/accept`,
        {
          method: "POST",
          credentials: "include",
        },
      );

      if (!response.ok) {
        const body = await response.text();

        throw new Error(
          `Failed to accept request (${response.status}): ${body}`,
        );
      }

      await loadRequests();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Failed to accept request",
      );
    } finally {
      setProcessingId(null);
    }
  }

  async function handleReject(id: string) {
    const reason = window.prompt(
      "Why are you rejecting this request?",
    );

    if (!reason) {
      return;
    }

    setProcessingId(id);
    setError("");

    try {
      const response = await fetch(
        `${API_URL}/admin/service-requests/${id}/reject`,
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            reason,
          }),
        },
      );

      if (!response.ok) {
        const body = await response.text();

        throw new Error(
          `Failed to reject request (${response.status}): ${body}`,
        );
      }

      await loadRequests();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Failed to reject request",
      );
    } finally {
      setProcessingId(null);
    }
  }

  return (
    <main className="dashboard-container">
      <section className="welcome-section">
        <p className="eyebrow">Operations</p>

        <h1>Service requests</h1>

        <p>
          Review incoming customer requests and decide
          which ones should become service jobs.
        </p>
      </section>

      {error && (
        <section className="dashboard-card">
          <p className="error-message">{error}</p>
        </section>
      )}

      {loading ? (
        <section className="dashboard-card">
          <p>Loading service requests...</p>
        </section>
      ) : requests.length === 0 ? (
        <section className="dashboard-card">
          <h2>No service requests</h2>

          <p>
            New customer requests will appear here.
          </p>
        </section>
      ) : (
        <section className="request-list">
          {requests.map((request) => (
            <article
              className="request-item"
              key={request.id}
            >
              <div>
                <strong>
                  {request.service_type}
                </strong>

                <p>{request.description}</p>

                <span>{request.address}</span>

                {request.preferred_date && (
                  <span>
                    Preferred date:{" "}
                    {request.preferred_date}
                  </span>
                )}

                {request.preferred_time && (
                  <span>
                    Preferred time:{" "}
                    {request.preferred_time}
                  </span>
                )}
              </div>

              <div>
                <span
                  className={`status-badge status-${request.status}`}
                >
                  <span />
                  {request.status}
                </span>

                {request.status === "pending" && (
                  <div className="form-row">
                    <button
                      className="primary-button"
                      disabled={
                        processingId === request.id
                      }
                      onClick={() =>
                        void handleAccept(request.id)
                      }
                    >
                      {processingId === request.id
                        ? "Processing..."
                        : "Accept"}
                    </button>

                    <button
                      disabled={
                        processingId === request.id
                      }
                      onClick={() =>
                        void handleReject(request.id)
                      }
                    >
                      Reject
                    </button>
                  </div>
                )}
              </div>
            </article>
          ))}
        </section>
      )}
    </main>
  );
}
