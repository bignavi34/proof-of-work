import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { API_URL } from "../api/config";
interface ServiceRequest {
  id: string;
  service_type: string;
  description: string;
  address: string;
  preferred_date: string | null;
  preferred_time: string | null;
  status: string;
  created_at: string;
}

export default function ServiceRequests() {
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const [serviceType, setServiceType] = useState("AC Cleaning");
  const [description, setDescription] = useState("");
  const [address, setAddress] = useState("");
  const [preferredDate, setPreferredDate] = useState("");
  const [preferredTime, setPreferredTime] = useState("");

  async function loadRequests() {
    try {
      setError("");

      const response = await fetch(
       `${API_URL}/service-requests/my`
,
        {
          credentials: "include",
        },
      );

      if (!response.ok) {
        throw new Error(
          `Failed to load requests: ${response.status}`,
        );
      }

      setRequests(await response.json());
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Failed to load requests",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadRequests();
  }, []);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    setSubmitting(true);
    setError("");

    try {
      const response = await fetch(
        `${API_URL}/service-requests`,
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            service_type: serviceType.trim(),
            description: description.trim(),
            address: address.trim(),
            preferred_date: preferredDate || null,
            preferred_time: preferredTime || null,
          }),
        },
      );

      if (!response.ok) {
        const errorBody = await response.text();

        throw new Error(
          `Failed to create request (${response.status}): ${errorBody}`,
        );
      }

      setDescription("");
      setAddress("");
      setPreferredDate("");
      setPreferredTime("");

      await loadRequests();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Failed to create request",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="dashboard-container">
      <section className="welcome-section">
        <div>
          <p className="eyebrow">Customer</p>

          <h1>Request a service</h1>

          <p>
            Tell us what you need and we'll connect
            you with a service provider.
          </p>
        </div>
      </section>

      <section className="request-layout">
        <form
          className="request-form-card"
          onSubmit={handleSubmit}
        >
          <h2>Service details</h2>

          <label>
            Service

            <select
              value={serviceType}
              onChange={(event) =>
                setServiceType(event.target.value)
              }
            >
              <option>AC Cleaning</option>
              <option>AC Repair</option>
              <option>AC Installation</option>
              <option>AC Inspection</option>
            </select>
          </label>

          <label>
            What do you need?

            <textarea
              value={description}
              onChange={(event) =>
                setDescription(event.target.value)
              }
              placeholder="Describe the problem or service you need..."
              required
              rows={5}
            />
          </label>

          <label>
            Service address

            <textarea
              value={address}
              onChange={(event) =>
                setAddress(event.target.value)
              }
              placeholder="Where should the technician come?"
              required
              rows={3}
            />
          </label>

          <div className="form-row">
            <label>
              Preferred date

              <input
                type="date"
                value={preferredDate}
                onChange={(event) =>
                  setPreferredDate(event.target.value)
                }
              />
            </label>

            <label>
              Preferred time

              <input
                type="time"
                value={preferredTime}
                onChange={(event) =>
                  setPreferredTime(event.target.value)
                }
              />
            </label>
          </div>

          <button
            className="primary-button"
            type="submit"
            disabled={submitting}
          >
            {submitting
              ? "Submitting..."
              : "Request service"}
          </button>

          {error && (
            <p className="error-message">
              {error}
            </p>
          )}
        </form>

        <section className="requests-card">
          <div className="card-heading">
            <div>
              <h2>My requests</h2>

              <p>
                Track your service requests.
              </p>
            </div>
          </div>

          {loading ? (
            <p className="empty-state">
              Loading requests...
            </p>
          ) : requests.length === 0 ? (
            <p className="empty-state">
              You haven't submitted any requests yet.
            </p>
          ) : (
            <div className="request-list">
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

                    <span>
                      {request.address}
                    </span>
                  </div>

                  <span
                    className={`status-badge status-${request.status}`}
                  >
                    <span />
                    {request.status}
                  </span>
                </article>
              ))}
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
