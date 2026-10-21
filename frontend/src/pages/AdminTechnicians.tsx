import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { API_URL } from "../api/config";
interface Technician {
  id: string;
  email: string;
  created_at: string;
}

export default function AdminTechnicians() {
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function loadTechnicians() {
    try {
      setLoading(true);
      setError("");

      const response = await fetch(
        `${API_URL}/admin/technicians`,
        {
          credentials: "include",
        },
      );

      if (!response.ok) {
        const body = await response.text();

        throw new Error(
          `Failed to load technicians (${response.status}): ${body}`,
        );
      }

      const data: Technician[] = await response.json();

      setTechnicians(data);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Failed to load technicians",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadTechnicians();
  }, []);

  async function handleAddTechnician(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail) {
      setError("Please enter a technician email.");
      return;
    }

    try {
      setAdding(true);
      setError("");
      setSuccess("");

      const response = await fetch(
        `${API_URL}/admin/technicians`,
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email: normalizedEmail,
          }),
        },
      );

      const body = await response.text();

      if (!response.ok) {
        let message = body;

        try {
          const parsed = JSON.parse(body);

          if (typeof parsed.detail === "string") {
            message = parsed.detail;
          }
        } catch {
          // Keep the raw response body.
        }

        throw new Error(
          `Failed to add technician (${response.status}): ${message}`,
        );
      }

      setEmail("");
      setSuccess(
        `${normalizedEmail} is now authorized as a technician.`,
      );

      await loadTechnicians();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Failed to add technician",
      );
    } finally {
      setAdding(false);
    }
  }

  return (
    <main className="dashboard-container">
      <section className="welcome-section">
        <p className="eyebrow">Administration</p>

        <h1>Technicians</h1>

        <p>
          Authorize technicians who can sign in and receive
          assigned jobs.
        </p>
      </section>

      <section className="dashboard-card">
        <h2>Add Technician</h2>

        <p>
          Enter the technician's Google account email.
          They can then use Technician Login independently.
        </p>

        <form onSubmit={handleAddTechnician}>
          <label htmlFor="technician-email">
            Technician Gmail
          </label>

          <input
            id="technician-email"
            type="email"
            value={email}
            onChange={(event) =>
              setEmail(event.target.value)
            }
            placeholder="technician@gmail.com"
            required
            disabled={adding}
            style={{
              display: "block",
              width: "100%",
              maxWidth: "500px",
              marginTop: "8px",
              padding: "10px",
            }}
          />

          <button
            type="submit"
            disabled={adding || !email.trim()}
            style={{
              marginTop: "12px",
            }}
          >
            {adding ? "Adding..." : "Add Technician"}
          </button>
        </form>
      </section>

      {error && (
        <section className="dashboard-card">
          <p className="error-message">{error}</p>
        </section>
      )}

      {success && (
        <section className="dashboard-card">
          <p>{success}</p>
        </section>
      )}

      <section className="dashboard-card">
        <h2>Authorized Technicians</h2>

        {loading ? (
          <p>Loading technicians...</p>
        ) : technicians.length === 0 ? (
          <p>No technicians have been authorized yet.</p>
        ) : (
          <section className="request-list">
            {technicians.map((technician) => (
              <article
                className="request-item"
                key={technician.id}
              >
                <div>
                  <strong>{technician.email}</strong>

                  <p>
                    Authorized{" "}
                    {new Date(
                      technician.created_at,
                    ).toLocaleString()}
                  </p>
                </div>

                <span className="status-badge status-assigned">
                  <span />
                  authorized
                </span>
              </article>
            ))}
          </section>
        )}
      </section>
    </main>
  );
}
