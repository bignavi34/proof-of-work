import { logout } from "../api/auth";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

const API_URL = "http://localhost:8000";

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

export default function TechnicianJobs() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const navigate = useNavigate();

  async function loadJobs() {
    try {
      setLoading(true);
      setError("");

      const response = await fetch(
        `${API_URL}/jobs/technician`,
        {
          credentials: "include",
        },
      );

      if (!response.ok) {
        const body = await response.text();

        throw new Error(
          `Failed to load jobs (${response.status}): ${body}`,
        );
      }

      const data: Job[] = await response.json();

      setJobs(data);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Failed to load assigned jobs",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadJobs();
  }, []);

  async function handleLogout() {
    try {
      await logout();
      navigate("/login", { replace: true });
    } catch (error) {
      console.error("Logout failed:", error);
    }
  }

  return (
    <main className="dashboard-container">
      <section className="welcome-section">
        <p className="eyebrow">Technician Portal</p>

        <h1>My Jobs</h1>

        <p>
          View the service jobs assigned to you.
        </p>
      </section>

      {error && (
        <section className="dashboard-card">
          <p className="error-message">{error}</p>
        </section>
      )}

      {loading ? (
        <section className="dashboard-card">
          <p>Loading assigned jobs...</p>
        </section>
      ) : jobs.length === 0 ? (
        <section className="dashboard-card">
          <h2>No assigned jobs</h2>

          <p>
            Your company has not assigned any jobs to you yet.
          </p>
        </section>
      ) : (
        <section className="request-list">
          {jobs.map((job) => (
            <article
              className="request-item"
              key={job.id}
            >
              <div>
                <strong>Service Job</strong>

                <p>
                  Request: {job.service_request_id}
                </p>

                <p>
                  Customer: {job.customer_id}
                </p>

                <p>
                  Assigned:{" "}
                  {new Date(
                    job.created_at,
                  ).toLocaleString()}
                </p>

                <div style={{ marginTop: "16px" }}>
                  <strong>Job ID</strong>

                  <p>{job.id}</p>
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-end",
                  gap: "12px",
                }}
              >
                <span
                  className={`status-badge status-${job.status}`}
                >
                  <span />
                  {job.status}
                </span>

                <button
                  type="button"
                  onClick={() =>
                    navigate(
                      `/technician/jobs/${job.id}`,
                    )
                  }
                >
                  Open Job
                </button>
              </div>
            </article>
          ))}
        </section>
      )}

      <section className="dashboard-card">
        <button
          type="button"
          onClick={() => void handleLogout()}
        >
          Logout
        </button>
      </section>
    </main>
  );
}
