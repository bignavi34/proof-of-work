import { useEffect, useMemo, useState } from "react";
import JobEvidence from "../components/JobEvidence";

const API_URL = "http://localhost:8000";

interface Job {
  id: string;
  service_request_id: string;
  customer_id: string;
  technician_id: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

type Filter = "all" | "completed" | "in_progress" | "evidence";

export default function AdminEvidence() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadJobs() {
    try {
      setLoading(true);
      setError("");

      const response = await fetch(`${API_URL}/admin/jobs`, {
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error(
          `Could not load jobs (${response.status}): ${await response.text()}`,
        );
      }

      const data: Job[] = await response.json();
      setJobs(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load jobs.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadJobs();
  }, []);

  const filteredJobs = useMemo(() => {
    const query = search.trim().toLowerCase();

    return jobs.filter((job) => {
      const matchesSearch =
        !query ||
        job.id.toLowerCase().includes(query) ||
        job.service_request_id.toLowerCase().includes(query) ||
        job.customer_id.toLowerCase().includes(query) ||
        (job.technician_id ?? "").toLowerCase().includes(query);

      const matchesFilter =
        filter === "all" ||
        (filter === "completed" && job.status === "completed") ||
        (filter === "in_progress" &&
          ["assigned", "in_progress"].includes(job.status)) ||
        (filter === "evidence" &&
          ["assigned", "in_progress", "completed"].includes(job.status));

      return matchesSearch && matchesFilter;
    });
  }, [jobs, filter, search]);

  const completedCount = jobs.filter(
    (job) => job.status === "completed",
  ).length;

  const activeCount = jobs.filter(
    (job) => ["assigned", "in_progress"].includes(job.status),
  ).length;

  return (
    <main className="dashboard-container">
      <section className="welcome-section">
        <p className="eyebrow">Operations / Quality control</p>
        <h1>Evidence Review</h1>
        <p>
          Inspect job evidence, review AI before-and-after comparisons,
          and verify submitted proof of work.
        </p>
      </section>

      <section className="request-list">
        <article className="request-item">
          <p className="eyebrow">Total jobs</p>
          <h2>{jobs.length}</h2>
        </article>

        <article className="request-item">
          <p className="eyebrow">Active jobs</p>
          <h2>{activeCount}</h2>
        </article>

        <article className="request-item">
          <p className="eyebrow">Completed jobs</p>
          <h2>{completedCount}</h2>
        </article>
      </section>

      <section className="dashboard-card">
        <label htmlFor="evidence-search">Search jobs</label>
        <input
          id="evidence-search"
          type="search"
          placeholder="Job ID, request ID, customer or technician ID"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />

        <label htmlFor="evidence-filter">Filter jobs</label>
        <select
          id="evidence-filter"
          value={filter}
          onChange={(event) => setFilter(event.target.value as Filter)}
        >
          <option value="all">All jobs</option>
          <option value="evidence">Jobs requiring evidence review</option>
          <option value="in_progress">Active jobs</option>
          <option value="completed">Completed jobs</option>
        </select>

        <button type="button" onClick={() => void loadJobs()}>
          Refresh jobs
        </button>
      </section>

      {error && (
        <section className="dashboard-card">
          <p className="error-message">{error}</p>
          <p>Check that you are signed in as a company admin.</p>
        </section>
      )}

      {loading ? (
        <section className="dashboard-card">
          <p>Loading jobs...</p>
        </section>
      ) : filteredJobs.length === 0 ? (
        <section className="dashboard-card">
          <h2>No matching jobs</h2>
          <p>Try another filter or search term.</p>
        </section>
      ) : (
        <section className="request-list">
          {filteredJobs.map((job) => {
            const expanded = expandedJobId === job.id;

            return (
              <article className="request-item" key={job.id}>
                <div>
                  <p className="eyebrow">Job</p>
                  <h2>{job.id}</h2>
                  <p>
                    <strong>Status:</strong> {job.status.replaceAll("_", " ")}
                  </p>
                  <p>
                    <strong>Request:</strong> {job.service_request_id}
                  </p>
                  <p>
                    <strong>Customer:</strong> {job.customer_id}
                  </p>
                  <p>
                    <strong>Technician:</strong>{" "}
                    {job.technician_id ?? "Not assigned"}
                  </p>
                  <p>
                    <strong>Updated:</strong>{" "}
                    {new Date(job.updated_at).toLocaleString()}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    setExpandedJobId(expanded ? null : job.id)
                  }
                  aria-expanded={expanded}
                >
                  {expanded ? "Hide evidence" : "Review evidence"}
                </button>

                {expanded && (
                  <div className="dashboard-card">
                    <h3>Submitted evidence and AI report</h3>
                    <JobEvidence jobId={job.id} />
                  </div>
                )}
              </article>
            );
          })}
        </section>
      )}
    </main>
  );
}
