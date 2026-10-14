
import { useEffect, useState } from "react";
import JobEvidence from "../components/JobEvidence";

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

const API_URL = "http://localhost:8000";

// Accept common completed-status spellings.
function isCompleted(status: string): boolean {
  return ["completed", "complete"].includes(
    status.trim().toLowerCase(),
  );
}

export default function CompletedWork() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadJobs() {
      try {
        const response = await fetch(`${API_URL}/jobs/my`, {
          credentials: "include",
        });

        if (!response.ok) {
          throw new Error(
            `Failed to load jobs (${response.status}).`,
          );
        }

        const data: Job[] = await response.json();
        setJobs(data.filter((job) => isCompleted(job.status)));
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Unable to load completed work.",
        );
      } finally {
        setLoading(false);
      }
    }

    void loadJobs();
  }, []);

  return (
    <main className="dashboard-container">
      <section className="welcome-section">
        <p className="eyebrow">Customer</p>
        <h1>Completed work</h1>
        <p>
          Review completed service jobs and their proof-of-work
          evidence.
        </p>
      </section>

      {loading ? (
        <section className="dashboard-card">
          <p>Loading completed work...</p>
        </section>
      ) : error ? (
        <section className="dashboard-card">
          <p className="error-message">{error}</p>
        </section>
      ) : jobs.length === 0 ? (
        <section className="dashboard-card">
          <h2>No completed jobs yet</h2>
          <p>
            Jobs will appear here after they have been marked
            completed.
          </p>
        </section>
      ) : (
        <section className="request-list">
          {jobs.map((job) => (
            <article className="request-item" key={job.id}>
              <div>
                <strong>Service job</strong>
                <p>
                  Completed job ID: {job.id}
                </p>
                <p>
                  Created{" "}
                  {new Date(job.created_at).toLocaleString()}
                </p>
              </div>

              <span className="status-badge status-completed">
                <span />
                Completed
              </span>

              <JobEvidence jobId={job.id} />
            </article>
          ))}
        </section>
      )}
    </main>
  );
}

