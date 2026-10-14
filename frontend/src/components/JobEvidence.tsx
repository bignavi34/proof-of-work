
import { useEffect, useState } from "react";

const API_URL = "http://localhost:8000";

interface Evidence {
  id: string;
  job_id: string;
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
}

type Assessment =
  | "relevant"
  | "partially_relevant"
  | "irrelevant"
  | "inconclusive";

interface AnalysisResult {
  observations: string[];
  job_relevance: string;
  potential_issues: string[];
  limitations: string[];
  assessment: Assessment;
}

interface EvidenceAnalysis {
  id: string;
  evidence_id: string;
  job_id: string;
  model_name: string;
  status: string;
  result: AnalysisResult;
  created_at: string;
}

interface Props {
  jobId: string;
}

const assessmentLabels: Record<Assessment, string> = {
  relevant: "Relevant",
  partially_relevant: "Partially relevant",
  irrelevant: "Irrelevant",
  inconclusive: "Inconclusive",
};

function formatAssessment(assessment: string) {
  return (
    assessmentLabels[assessment as Assessment] ??
    "Unknown assessment"
  );
}

export default function JobEvidence({ jobId }: Props) {
  const [items, setItems] = useState<Evidence[]>([]);
  const [analyses, setAnalyses] = useState<
    Record<string, EvidenceAnalysis>
  >({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [analysisLoading, setAnalysisLoading] = useState<
    Record<string, boolean>
  >({});
  const [analysisErrors, setAnalysisErrors] = useState<
    Record<string, string>
  >({});

  useEffect(() => {
    let cancelled = false;

    async function loadEvidence() {
      try {
        setLoading(true);
        setError("");
        setAnalyses({});
        setAnalysisErrors({});

        const response = await fetch(
          `${API_URL}/jobs/${jobId}/evidence`,
          { credentials: "include" },
        );

        if (!response.ok) {
          throw new Error(
            `Could not load evidence (${response.status})`,
          );
        }

        const data: Evidence[] = await response.json();

        if (cancelled) return;

        setItems(data);

        // Load saved analyses without triggering new AI calls.
        const savedAnalyses = await Promise.all(
          data.map(async (item) => {
            try {
              const analysisResponse = await fetch(
                `${API_URL}/jobs/${jobId}/evidence/${item.id}/analysis`,
                { credentials: "include" },
              );

              // No saved analysis is a normal state.
              if (analysisResponse.status === 404) {
                return null;
              }

              if (!analysisResponse.ok) {
                throw new Error(
                  `Could not load analysis (${analysisResponse.status})`,
                );
              }

              return (await analysisResponse.json()) as EvidenceAnalysis;
            } catch (err) {
              if (cancelled) return null;

              setAnalysisErrors((previous) => ({
                ...previous,
                [item.id]:
                  err instanceof Error
                    ? err.message
                    : "Could not load saved analysis",
              }));

              return null;
            }
          }),
        );

        if (cancelled) return;

        const analysisMap: Record<string, EvidenceAnalysis> = {};

        for (const analysis of savedAnalyses) {
          if (analysis) {
            analysisMap[analysis.evidence_id] = analysis;
          }
        }

        setAnalyses(analysisMap);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Could not load evidence",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadEvidence();

    return () => {
      cancelled = true;
    };
  }, [jobId]);

  async function analyzeEvidence(evidenceId: string) {
    setAnalysisLoading((previous) => ({
      ...previous,
      [evidenceId]: true,
    }));

    setAnalysisErrors((previous) => ({
      ...previous,
      [evidenceId]: "",
    }));

    try {
      const response = await fetch(
        `${API_URL}/jobs/${jobId}/evidence/${evidenceId}/analyze`,
        {
          method: "POST",
          credentials: "include",
        },
      );

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        const detail =
          typeof body?.detail === "string"
            ? body.detail
            : `Analysis failed (${response.status})`;

        throw new Error(detail);
      }

      const analysis: EvidenceAnalysis = await response.json();

      setAnalyses((previous) => ({
        ...previous,
        [evidenceId]: analysis,
      }));
    } catch (err) {
      setAnalysisErrors((previous) => ({
        ...previous,
        [evidenceId]:
          err instanceof Error
            ? err.message
            : "Could not analyze evidence",
      }));
    } finally {
      setAnalysisLoading((previous) => ({
        ...previous,
        [evidenceId]: false,
      }));
    }
  }

  return (
    <section style={{ marginTop: "20px" }}>
      <h3>Proof of Work</h3>

      {loading && <p>Loading evidence...</p>}
      {error && <p className="error-message">{error}</p>}

      {!loading && !error && items.length === 0 && (
        <p>No evidence has been uploaded yet.</p>
      )}

      {items.map((item) => {
        const imageUrl =
          `${API_URL}/jobs/${jobId}/evidence/${item.id}/file`;

        const analysis = analyses[item.id];
        const isAnalyzing = Boolean(analysisLoading[item.id]);
        const currentAnalysisError = analysisErrors[item.id];

        return (
          <article
            key={item.id}
            style={{
              border: "1px solid #ddd",
              borderRadius: "10px",
              padding: "16px",
              marginTop: "12px",
            }}
          >
            <h4>{item.evidence_type.replaceAll("_", " ")}</h4>

            <img
              src={imageUrl}
              alt={item.description || item.evidence_type}
              loading="lazy"
              style={{
                display: "block",
                width: "100%",
                maxWidth: "480px",
                maxHeight: "360px",
                objectFit: "contain",
                borderRadius: "8px",
                background: "#f4f4f4",
              }}
            />

            <p>
              <strong>File:</strong> {item.original_filename}
            </p>

            <p>
              <strong>Uploaded:</strong>{" "}
              {new Date(item.uploaded_at).toLocaleString()}
            </p>

            {item.captured_at && (
              <p>
                <strong>Captured:</strong>{" "}
                {new Date(item.captured_at).toLocaleString()}
              </p>
            )}

            {item.latitude !== null &&
              item.longitude !== null && (
                <p>
                  <strong>Location:</strong>{" "}
                  {item.latitude}, {item.longitude}
                </p>
              )}

            {item.description && <p>{item.description}</p>}

            {item.checklist && (
              <div>
                <strong>Checklist</strong>
                <pre>{JSON.stringify(item.checklist, null, 2)}</pre>
              </div>
            )}

            {item.measurements && (
              <div>
                <strong>Measurements</strong>
                <pre>
                  {JSON.stringify(item.measurements, null, 2)}
                </pre>
              </div>
            )}

            <hr />

            <h4>AI Evidence Analysis</h4>

            <button
              type="button"
              onClick={() => void analyzeEvidence(item.id)}
              disabled={isAnalyzing}
            >
              {isAnalyzing
                ? "Analyzing image..."
                : analysis
                  ? "Analyze again"
                  : "Analyze evidence"}
            </button>

            {currentAnalysisError && (
              <p className="error-message" role="alert">
                {currentAnalysisError}
              </p>
            )}

            {analysis && (
              <div
                style={{
                  marginTop: "16px",
                  padding: "14px",
                  border: "1px solid #ddd",
                  borderRadius: "8px",
                }}
              >
                <p>
                  <strong>Assessment:</strong>{" "}
                  {formatAssessment(analysis.result.assessment)}
                </p>

                <p>
                  <strong>Job relevance:</strong>{" "}
                  {analysis.result.job_relevance}
                </p>

                <p>
                  <strong>Model:</strong> {analysis.model_name}
                </p>

                <p>
                  <strong>Analyzed:</strong>{" "}
                  {new Date(analysis.created_at).toLocaleString()}
                </p>

                <h5>Observations</h5>
                {analysis.result.observations.length > 0 ? (
                  <ul>
                    {analysis.result.observations.map((observation, i) => (
                      <li key={i}>{observation}</li>
                    ))}
                  </ul>
                ) : (
                  <p>No observations provided.</p>
                )}

                <h5>Potential issues</h5>
                {analysis.result.potential_issues.length > 0 ? (
                  <ul>
                    {analysis.result.potential_issues.map((issue, i) => (
                      <li key={i}>{issue}</li>
                    ))}
                  </ul>
                ) : (
                  <p>No potential issues reported.</p>
                )}

                <h5>Limitations</h5>
                {analysis.result.limitations.length > 0 ? (
                  <ul>
                    {analysis.result.limitations.map((limitation, i) => (
                      <li key={i}>{limitation}</li>
                    ))}
                  </ul>
                ) : (
                  <p>No limitations reported.</p>
                )}

                <p>
                  <small>
                    AI analysis is an aid to reviewing evidence, not
                    independent proof that the work was completed.
                  </small>
                </p>
              </div>
            )}

            {!analysis && !isAnalyzing && !currentAnalysisError && (
              <p>
                No saved analysis is available. Select Analyze evidence
                to evaluate this image against the service request.
              </p>
            )}
          </article>
        );
      })}
    </section>
  );
}

