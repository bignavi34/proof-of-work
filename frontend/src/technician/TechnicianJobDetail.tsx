import { useNavigate, useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";

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

interface Evidence {
  id: string;
  job_id: string;
  technician_id: string;
  evidence_type: string;
  original_filename: string;
  mime_type: string;
  file_size: number;
  latitude: number | null;
  longitude: number | null;
  captured_at: string | null;
  uploaded_at: string;
  checklist: Record<string, unknown> | null;
  measurements: Record<string, unknown> | null;
  description: string | null;
  created_at: string;
}

export default function TechnicianJobDetail() {
  const navigate = useNavigate();
  const { jobId } = useParams<{ jobId: string }>();

  const [job, setJob] = useState<Job | null>(null);
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [completing, setCompleting] = useState(false);

  const [file, setFile] = useState<File | null>(null);
  const [evidenceType, setEvidenceType] = useState("before_service");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [capturedAt, setCapturedAt] = useState("");
  const [checklist, setChecklist] = useState(
    '{"power_off":true,"filter_checked":true}',
  );
  const [measurements, setMeasurements] = useState(
    '{"input_voltage":"230V","temperature":"24C"}',
  );
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function loadJob() {
    if (!jobId) {
      setError("Missing job ID.");
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError("");

      const [jobsResponse, evidenceResponse] = await Promise.all([
        fetch(`${API_URL}/jobs/technician`, { credentials: "include" }),
        fetch(`${API_URL}/jobs/${jobId}/evidence`, {
          credentials: "include",
        }),
      ]);

      if (!jobsResponse.ok) {
        throw new Error("Failed to load jobs.");
      }

      if (!evidenceResponse.ok) {
        const body = await evidenceResponse.text();
        let message = body;

        try {
          const parsed = JSON.parse(body);
          if (typeof parsed.detail === "string") message = parsed.detail;
        } catch {
          // Keep raw response.
        }

        throw new Error(
          `Failed to load evidence (${evidenceResponse.status}): ${message}`,
        );
      }

      const jobs: Job[] = await jobsResponse.json();
      const evidenceData: Evidence[] = await evidenceResponse.json();
      const currentJob = jobs.find((item) => item.id === jobId);

      if (!currentJob) {
        throw new Error("Job not found or not assigned to you.");
      }

      setJob(currentJob);
      setEvidence(evidenceData);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Failed to load job",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadJob();
  }, [jobId]);

  function getCurrentLocation() {
    if (!navigator.geolocation) {
      setError("Geolocation is not supported by this browser.");
      return;
    }

    setError("");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLatitude(position.coords.latitude.toFixed(6));
        setLongitude(position.coords.longitude.toFixed(6));
      },
      (locationError) => {
        setError(`Could not get location: ${locationError.message}`);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  }

  function setCurrentTimestamp() {
    setCapturedAt(new Date().toISOString());
  }

  async function handleUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!jobId) {
      setError("Missing job ID.");
      return;
    }
    if (!file) {
      setError("Please select an image.");
      return;
    }

    let parsedChecklist: unknown;
    let parsedMeasurements: unknown;

    try {
      parsedChecklist = JSON.parse(checklist);
    } catch {
      setError("Checklist must contain valid JSON.");
      return;
    }
    try {
      parsedMeasurements = JSON.parse(measurements);
    } catch {
      setError("Measurements must contain valid JSON.");
      return;
    }

    if (
      typeof parsedChecklist !== "object" ||
      parsedChecklist === null ||
      Array.isArray(parsedChecklist)
    ) {
      setError("Checklist must be a JSON object.");
      return;
    }
    if (
      typeof parsedMeasurements !== "object" ||
      parsedMeasurements === null ||
      Array.isArray(parsedMeasurements)
    ) {
      setError("Measurements must be a JSON object.");
      return;
    }

    try {
      setUploading(true);
      setError("");
      setSuccess("");

      const formData = new FormData();
      formData.append("file", file);
      formData.append("evidence_type", evidenceType);
      if (latitude.trim()) formData.append("latitude", latitude.trim());
      if (longitude.trim()) formData.append("longitude", longitude.trim());
      if (capturedAt.trim()) formData.append("captured_at", capturedAt.trim());
      formData.append("checklist", checklist);
      formData.append("measurements", measurements);
      if (description.trim()) {
        formData.append("description", description.trim());
      }

      const response = await fetch(`${API_URL}/jobs/${jobId}/evidence`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      const body = await response.text();

      if (!response.ok) {
        let message = body;
        try {
          const parsed = JSON.parse(body);
          if (typeof parsed.detail === "string") message = parsed.detail;
        } catch {
          // Keep raw response.
        }
        throw new Error(
          `Upload failed (${response.status}): ${message}`,
        );
      }

      const uploadedEvidence: Evidence = JSON.parse(body);
      setEvidence((current) => [uploadedEvidence, ...current]);
      setFile(null);
      setDescription("");
      setSuccess("Evidence uploaded successfully.");
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Failed to upload evidence",
      );
    } finally {
      setUploading(false);
    }
  }

  const hasBeforeEvidence = evidence.some((item) =>
    ["before", "before_service"].includes(item.evidence_type),
  );
  const hasAfterEvidence = evidence.some((item) =>
    ["after", "after_service"].includes(item.evidence_type),
  );

  async function handleCompleteJob() {
    if (!jobId || !job) {
      setError("Missing job information.");
      return;
    }
    if (!hasBeforeEvidence || !hasAfterEvidence) {
      setError(
        "Upload both Before Service and After Service photos before completing this job.",
      );
      return;
    }

    try {
      setCompleting(true);
      setError("");
      setSuccess("");

      const response = await fetch(`${API_URL}/jobs/${jobId}/complete`, {
        method: "POST",
        credentials: "include",
      });
      const body = await response.text();
      let payload: Partial<Job> & { detail?: string } = {};

      try {
        payload = body ? JSON.parse(body) : {};
      } catch {
        // Keep an empty payload if the response is not JSON.
      }

      if (!response.ok) {
        throw new Error(
          payload.detail || `Could not complete job (${response.status}).`,
        );
      }

      if (payload.id) {
        setJob(payload as Job);
      } else {
        await loadJob();
      }
      setSuccess("Job marked as completed.");
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Failed to complete job",
      );
    } finally {
      setCompleting(false);
    }
  }

  if (loading) {
    return (
      <main className="loading-page">
        <p>Loading job...</p>
      </main>
    );
  }

  if (!job) {
    return (
      <main>
        <p>{error || "Job not found."}</p>
        <button type="button" onClick={() => navigate("/technician")}>
          Back to Jobs
        </button>
      </main>
    );
  }

  return (
    <main
      style={{
        maxWidth: "1000px",
        margin: "0 auto",
        padding: "32px 24px",
      }}
    >
      <button
        type="button"
        onClick={() => navigate("/technician")}
        style={{ marginBottom: "24px" }}
      >
        ← Back to Jobs
      </button>

      <header style={{ marginBottom: "32px" }}>
        <h1>Job Evidence</h1>
        <p>
          <strong>Job ID:</strong> {job.id}
        </p>
        <p>
          <strong>Status:</strong> {job.status}
        </p>

        {job.status === "assigned" && (
          <div style={{ marginTop: "16px" }}>
            <p>
              Upload both before-service and after-service photos before
              completing this job.
            </p>
            <p>
              Evidence checklist: {hasBeforeEvidence ? "✓" : "○"} Before photo{" "}
              {hasAfterEvidence ? "✓" : "○"} After photo
            </p>
            <button
              type="button"
              onClick={handleCompleteJob}
              disabled={
                completing ||
                uploading ||
                !hasBeforeEvidence ||
                !hasAfterEvidence
              }
            >
              {completing ? "Completing..." : "Mark Job Complete"}
            </button>
          </div>
        )}

        {job.status === "completed" && (
          <p style={{ color: "#15803d", fontWeight: 600 }}>
            ✓ This job is completed.
          </p>
        )}
      </header>

      {error && (
        <div
          role="alert"
          style={{
            padding: "12px",
            marginBottom: "16px",
            border: "1px solid #dc2626",
            borderRadius: "8px",
          }}
        >
          {error}
        </div>
      )}

      {success && (
        <div
          role="status"
          style={{
            padding: "12px",
            marginBottom: "16px",
            border: "1px solid #16a34a",
            borderRadius: "8px",
          }}
        >
          {success}
        </div>
      )}

      <section
        style={{
          padding: "24px",
          border: "1px solid #ddd",
          borderRadius: "12px",
          marginBottom: "32px",
        }}
      >
        <h2>Upload Evidence</h2>

        {job.status === "completed" ? (
          <p>This job is complete. Evidence uploads are disabled.</p>
        ) : (
          <form onSubmit={handleUpload}>
            <div style={{ marginBottom: "16px" }}>
              <label>
                <strong>Photo</strong>
                <br />
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(event) =>
                    setFile(event.target.files?.[0] ?? null)
                  }
                />
              </label>
            </div>

            <div style={{ marginBottom: "16px" }}>
              <label>
                <strong>Evidence Type</strong>
                <br />
                <select
                  value={evidenceType}
                  onChange={(event) => setEvidenceType(event.target.value)}
                >
                  <option value="before_service">Before Service</option>
                  <option value="during_service">During Service</option>
                  <option value="after_service">After Service</option>
                  <option value="measurement">Measurement</option>
                  <option value="completion">Completion</option>
                </select>
              </label>
            </div>

            <div
              style={{
                display: "flex",
                gap: "12px",
                marginBottom: "16px",
                flexWrap: "wrap",
              }}
            >
              <button type="button" onClick={getCurrentLocation}>
                📍 Use Current Location
              </button>
              <button type="button" onClick={setCurrentTimestamp}>
                🕐 Use Current Time
              </button>
            </div>

            <div style={{ marginBottom: "16px" }}>
              <label>
                Latitude
                <br />
                <input
                  type="text"
                  value={latitude}
                  onChange={(event) => setLatitude(event.target.value)}
                  placeholder="23.520400"
                />
              </label>
            </div>

            <div style={{ marginBottom: "16px" }}>
              <label>
                Longitude
                <br />
                <input
                  type="text"
                  value={longitude}
                  onChange={(event) => setLongitude(event.target.value)}
                  placeholder="87.311900"
                />
              </label>
            </div>

            <div style={{ marginBottom: "16px" }}>
              <label>
                Captured At
                <br />
                <input
                  type="text"
                  value={capturedAt}
                  onChange={(event) => setCapturedAt(event.target.value)}
                  placeholder="2026-10-08T04:32:05.827Z"
                />
              </label>
            </div>

            <div style={{ marginBottom: "16px" }}>
              <label>
                Checklist JSON
                <br />
                <textarea
                  rows={4}
                  value={checklist}
                  onChange={(event) => setChecklist(event.target.value)}
                  style={{ width: "100%" }}
                />
              </label>
            </div>

            <div style={{ marginBottom: "16px" }}>
              <label>
                Measurements JSON
                <br />
                <textarea
                  rows={4}
                  value={measurements}
                  onChange={(event) => setMeasurements(event.target.value)}
                  style={{ width: "100%" }}
                />
              </label>
            </div>

            <div style={{ marginBottom: "16px" }}>
              <label>
                Description
                <br />
                <textarea
                  rows={4}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Describe what this evidence shows..."
                  style={{ width: "100%" }}
                />
              </label>
            </div>

            <button type="submit" disabled={uploading || completing}>
              {uploading ? "Uploading..." : "Upload Evidence"}
            </button>
          </form>
        )}
      </section>

      <section>
        <h2>Uploaded Evidence</h2>

        {evidence.length === 0 ? (
          <p>No evidence uploaded yet.</p>
        ) : (
          <div>
            {evidence.map((item) => (
              <article
                key={item.id}
                style={{
                  padding: "20px",
                  border: "1px solid #ddd",
                  borderRadius: "12px",
                  marginBottom: "16px",
                }}
              >
                <h3>{item.evidence_type}</h3>
                <p>
                  <strong>File:</strong> {item.original_filename}
                </p>
                <p>
                  <strong>Size:</strong> {(item.file_size / 1024).toFixed(1)} KB
                </p>

                {item.latitude !== null && item.longitude !== null && (
                  <p>
                    <strong>Location:</strong> {item.latitude}, {item.longitude}
                  </p>
                )}

                {item.captured_at && (
                  <p>
                    <strong>Captured:</strong>{" "}
                    {new Date(item.captured_at).toLocaleString()}
                  </p>
                )}

                {item.description && (
                  <p>
                    <strong>Description:</strong> {item.description}
                  </p>
                )}

                {item.checklist && (
                  <div>
                    <strong>Checklist</strong>
                    <pre>{JSON.stringify(item.checklist, null, 2)}</pre>
                  </div>
                )}

                {item.measurements && (
                  <div>
                    <strong>Measurements</strong>
                    <pre>{JSON.stringify(item.measurements, null, 2)}</pre>
                  </div>
                )}

                <small>
                  Uploaded {new Date(item.uploaded_at).toLocaleString()}
                </small>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

