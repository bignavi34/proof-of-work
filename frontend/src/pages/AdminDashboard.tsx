import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import AIWorkSearch from "../components/AIWorkSearch";
import { API_URL } from "../api/config";
interface AdminAccess {
  id: string;
  email: string;
  created_at: string;
}

export default function AdminDashboard() {
  const [admins, setAdmins] = useState<AdminAccess[]>([]);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [message, setMessage] = useState("");

  async function loadAdmins() {
    try {
      const response = await fetch(
        `${API_URL}/admin/access`,
        {
          credentials: "include",
        },
      );

      if (!response.ok) {
        throw new Error("Failed to load administrators");
      }

      setAdmins(await response.json());
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }
useEffect(() => {
  const timer = window.setTimeout(() => {
    void loadAdmins();
  }, 0);

  return () => {
    window.clearTimeout(timer);
  };
}, []);
  async function handleAddAdmin(event: FormEvent) {
    event.preventDefault();

    if (!email.trim()) {
      return;
    }

    setAdding(true);
    setMessage("");

    try {
      const response = await fetch(
        `${API_URL}/admin/access`,
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email: email.trim(),
          }),
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.detail || "Failed to add administrator",
        );
      }

      setEmail("");
      setMessage(
        `${data.email} now has administrator access.`,
      );

      await loadAdmins();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Failed to add administrator.",
      );
    } finally {
      setAdding(false);
    }
  }

  return (
    <>
      <section className="welcome-section">
        <p className="eyebrow">Company operations</p>

        <h1>Operations overview</h1>

        <p>
          Manage service requests, technicians, jobs and
          submitted evidence.
        </p>
      </section>
       <AIWorkSearch audience="admin" />
      <section className="dashboard-grid">
        <div className="dashboard-card">
          <h2>Incoming requests</h2>
          <p>
            Review and accept new customer requests.
          </p>
          <span className="action-link">
            Review requests →
          </span>
        </div>

        <div className="dashboard-card">
          <h2>Technicians</h2>
          <p>
            Manage technicians and their availability.
          </p>
          <span className="action-link">
            Manage technicians →
          </span>
        </div>

        <div className="dashboard-card">
          <h2>Active jobs</h2>
          <p>
            Monitor currently assigned service work.
          </p>
          <span className="action-link">
            View jobs →
          </span>
        </div>

        <div className="dashboard-card">
          <h2>Evidence</h2>
          <p>
            Review submitted proof-of-work evidence.
          </p>
          <span className="action-link">
            Review evidence →
          </span>
        </div>
      </section>

      <section className="admin-management-card">
        <div className="admin-management-header">
          <div>
            <p className="eyebrow">Access control</p>

            <h2>Administrators</h2>

            <p>
              Give another Google account access to the
              company administration console.
            </p>
          </div>
        </div>

        <form
          className="admin-add-form"
          onSubmit={handleAddAdmin}
        >
          <input
            type="email"
            value={email}
            onChange={(event) =>
              setEmail(event.target.value)
            }
            placeholder="administrator@gmail.com"
            required
          />

          <button
            type="submit"
            className="primary-button"
            disabled={adding}
          >
            {adding
              ? "Granting..."
              : "Grant admin access"}
          </button>
        </form>

        {message && (
          <p className="admin-management-message">
            {message}
          </p>
        )}

        <div className="admin-list">
          {loading ? (
            <p className="empty-state">
              Loading administrators...
            </p>
          ) : admins.length === 0 ? (
            <p className="empty-state">
              No administrators found.
            </p>
          ) : (
            admins.map((admin) => (
              <div
                className="admin-list-item"
                key={admin.id}
              >
                <div className="admin-list-avatar">
                  {admin.email
                    .charAt(0)
                    .toUpperCase()}
                </div>

                <div>
                  <strong>{admin.email}</strong>

                  <span>
                    Administrator
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </>
  );
}
