import { useEffect, useState } from "react";
import JobEvidence from "../components/JobEvidence";
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

interface Technician {
  id: string;
  email: string;
  created_at: string;
}

export default function AdminJobs() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [selectedTechnicians, setSelectedTechnicians] = useState<
    Record<string, string>
  >({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [assigningJobId, setAssigningJobId] = useState<string | null>(
    null,
  );
  const [successMessage, setSuccessMessage] = useState("");

  async function loadData() {
    try {
      setLoading(true);
      setError("");

      const [jobsResponse, techniciansResponse] =
        await Promise.all([
          fetch(`${API_URL}/admin/jobs`, {
            credentials: "include",
          }),
          fetch(`${API_URL}/admin/technicians`, {
            credentials: "include",
          }),
        ]);

      if (!jobsResponse.ok) {
        const body = await jobsResponse.text();
        throw new Error(
          `Failed to load jobs (${jobsResponse.status}): ${body}`,
        );
      }

      if (!techniciansResponse.ok) {
        const body = await techniciansResponse.text();
        throw new Error(
          `Failed to load technicians (${techniciansResponse.status}): ${body}`,
        );
      }

      const jobsData: Job[] = await jobsResponse.json();
      const techniciansData: Technician[] =
        await techniciansResponse.json();

      setJobs(jobsData);
      setTechnicians(techniciansData);
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
    void loadData();
  }, []);

  function handleTechnicianChange(
    jobId: string,
    technicianId: string,
  ) {
    setSelectedTechnicians((current) => ({
      ...current,
      [jobId]: technicianId,
    }));

    setSuccessMessage("");
  }

  async function assignTechnician(jobId: string) {
    const technicianId = selectedTechnicians[jobId];

    if (!technicianId) {
      setError("Please select a technician first.");
      return;
    }

    try {
      setAssigningJobId(jobId);
      setError("");
      setSuccessMessage("");

      const response = await fetch(
        `${API_URL}/admin/jobs/${jobId}/assign`,
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            technician_id: technicianId,
          }),
        },
      );

      if (!response.ok) {
        const body = await response.text();

        throw new Error(
          `Failed to assign technician (${response.status}): ${body}`,
        );
      }

      await response.json();

      setSuccessMessage(
        "Technician assigned successfully.",
      );

      setSelectedTechnicians((current) => {
        const updated = { ...current };
        delete updated[jobId];
        return updated;
      });

      await loadData();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Failed to assign technician",
      );
    } finally {
      setAssigningJobId(null);
    }
  }

  function getTechnicianEmail(
    technicianId: string | null,
  ) {
    if (!technicianId) {
      return null;
    }

    const technician = technicians.find(
      (item) => item.id === technicianId,
    );

    return technician?.email ?? technicianId;
  }

  return (
    <main className="dashboard-container">
      <section className="welcome-section">
        <p className="eyebrow">Operations</p>

        <h1>Jobs</h1>

        <p>
          Manage accepted service jobs and assign
          technicians.
        </p>
      </section>

      {error && (
        <section className="dashboard-card">
          <p className="error-message">{error}</p>
        </section>
      )}

      {successMessage && (
        <section className="dashboard-card">
          <p>{successMessage}</p>
        </section>
      )}

      {loading ? (
        <section className="dashboard-card">
          <p>Loading jobs...</p>
        </section>
      ) : jobs.length === 0 ? (
        <section className="dashboard-card">
          <h2>No jobs yet</h2>

          <p>
            Accepting a customer request will create a
            job here.
          </p>
        </section>
      ) : (
        <section className="request-list">
          {jobs.map((job) => {
            const technicianEmail =
              getTechnicianEmail(job.technician_id);

            const isAssigning =
              assigningJobId === job.id;

            return (
              <article
                className="request-item"
                key={job.id}
              >
                <div>
                  <strong>Service Job</strong>

                  <p>
                    Request:{" "}
                    {job.service_request_id}
                  </p>

                  <p>
                    Customer:{" "}
                    {job.customer_id}
                  </p>

                  <span>
                    Created{" "}
                    {new Date(
                      job.created_at,
                    ).toLocaleString()}
                  </span>

                  {job.technician_id ? (
                    <div style={{ marginTop: "12px" }}>
                      <strong>
                        Technician
                      </strong>

                      <p>
                        {technicianEmail}
                      </p>
                    </div>
                  ) : (
                    <div style={{ marginTop: "16px" }}>
                      <label
                        htmlFor={`technician-${job.id}`}
                      >
                        Technician
                      </label>

                      <select
                        id={`technician-${job.id}`}
                        value={
                          selectedTechnicians[
                            job.id
                          ] ?? ""
                        }
                        onChange={(event) =>
                          handleTechnicianChange(
                            job.id,
                            event.target.value,
                          )
                        }
                        disabled={isAssigning}
                        style={{
                          display: "block",
                          marginTop: "8px",
                          width: "100%",
                          maxWidth: "400px",
                          padding: "10px",
                        }}
                      >
                        <option value="">
                          Select technician
                        </option>

                        {technicians.map(
                          (technician) => (
                            <option
                              key={technician.id}
                              value={technician.id}
                            >
                              {technician.email}
                            </option>
                          ),
                        )}
                      </select>

                      <button
                        type="button"
                        onClick={() =>
                          void assignTechnician(
                            job.id,
                          )
                        }
                        disabled={
                          isAssigning ||
                          !selectedTechnicians[
                            job.id
                          ]
                        }
                        style={{
                          marginTop: "10px",
                        }}
                      >
                        {isAssigning
                          ? "Assigning..."
                          : "Assign Technician"}
                      </button>
                    </div>
                  )}
                </div>

                <span
                  className={`status-badge status-${job.status}`}
                >
                  <span />
                  {job.status}
                </span>
                <JobEvidence jobId={job.id} />

              </article>
            );
          })}
        </section>
      )}
    </main>
  );
}
