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

export default function CustomerJobs() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadJobs() {
    try {
      const response = await fetch(
        "http://localhost:8000/jobs/my",
        {
          credentials: "include",
        },
      );

      if (!response.ok) {
        throw new Error(
          `Failed to load jobs: ${response.status}`,
        );
      }

      setJobs(await response.json());
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Failed to load jobs",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadJobs();
  }, []);

  return (
    <main className="dashboard-container">
      <section className="welcome-section">
        <p className="eyebrow">Customer</p>

        <h1>My jobs</h1>

        <p>
          Track services that have been accepted by the
          company.
        </p>
      </section>

      {loading ? (
        <section className="dashboard-card">
          <p>Loading jobs...</p>
        </section>
      ) : error ? (
        <section className="dashboard-card">
          <p className="error-message">{error}</p>
        </section>
      ) : jobs.length === 0 ? (
        <section className="dashboard-card">
          <h2>No active jobs</h2>

          <p>
            Once a company accepts your service request,
            the job will appear here.
          </p>
        </section>
      ) : (
        <section className="request-list">
  {jobs.map((job) => (
    <article className="request-item" key={job.id}>
      <div>
        <strong>Service job</strong>
        <p>
          Job created {new Date(job.created_at).toLocaleString()}
        </p>
      </div>

      <span className={`status-badge status-${job.status}`}>
        <span />
        {job.status}
      </span>

      <JobEvidence jobId={job.id} />
    </article>
  ))}
</section>     )}
    </main>
  );
}
