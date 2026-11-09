import { useCallback, useEffect, useState } from "react";

import { API_URL } from "../api/config";
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

type ComparisonAssessment =
  | "improvement_visible"
  | "no_clear_change"
  | "possible_issue"
  | "inconclusive";

interface ComparisonResult {
  before_observations: string[];
  after_observations: string[];
  changes_observed: string[];
  job_relevance: string;
  potential_issues: string[];
  limitations: string[];
  assessment: ComparisonAssessment;
}

interface ComparisonReport {
  id: string;
  evidence_id: string;
  job_id: string;
  model_name: string;
  status: string;
  result: ComparisonResult;
  created_at: string;
  analysis_type: "before_after_comparison";
  before_evidence_ids: string[];
  after_evidence_ids: string[];
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

const comparisonAssessmentLabels: Record<ComparisonAssessment, string> = {
  improvement_visible: "Improvement visible",
  no_clear_change: "No clear change",
  possible_issue: "Possible issue",
  inconclusive: "Inconclusive",
};

function formatAssessment(assessment: string) {
  return (
    assessmentLabels[assessment as Assessment] ??
    comparisonAssessmentLabels[assessment as ComparisonAssessment] ??
    "Unknown assessment"
  );
}

function renderStringList(title: string, values: string[]) {
  return (
    <div>
      <h5>{title}</h5>
      {values.length > 0 ? (
        <ul>
          {values.map((value, index) => (
            <li key={`${title}-${index}`}>{value}</li>
          ))}
        </ul>
      ) : (
        <p>None reported.</p>
      )}
    </div>
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
  const [comparison, setComparison] =
    useState<ComparisonReport | null>(null);
  const [comparisonLoading, setComparisonLoading] = useState(false);
  const [comparisonError, setComparisonError] = useState("");
  const [comparisonRunning, setComparisonRunning] = useState(false);

  const loadComparison = useCallback(async () => {
    setComparisonLoading(true);
    setComparisonError("");

    try {
      const response = await fetch(
        `${API_URL}/jobs/${jobId}/evidence/comparison`,
        { credentials: "include" },
      );

      if (response.status === 404) {
        setComparison(null);
        return;
      }

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        const detail =
          typeof body?.detail === "string"
            ? body.detail
            : `Could not load comparison (${response.status})`;
        throw new Error(detail);
      }

      const report = (await response.json()) as ComparisonReport;
      setComparison(report);
    } catch (err) {
      setComparisonError(
        err instanceof Error
          ? err.message
          : "Could not load comparison report",
      );
    } finally {
      setComparisonLoading(false);
    }
  }, [jobId]);

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

        // Load saved single-image analyses without triggering AI requests.
        const savedAnalyses = await Promise.all(
          data.map(async (item) => {
            try {
              const analysisResponse = await fetch(
                `${API_URL}/jobs/${jobId}/evidence/${item.id}/analysis`,
                { credentials: "include" },
              );

              if (analysisResponse.status === 404) return null;

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
            err instanceof Error ? err.message : "Could not load evidence",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadEvidence();

    return () => {
      cancelled = true;
    };
  }, [jobId]);

  useEffect(() => {
    void loadComparison();
  }, [loadComparison]);

  async function analyzeEvidence(evidenceId: string) {
    setAnalysisLoading((previous) => ({
      ...previous,
      [evidenceId]: true,
    }));
    setAnalysisErrors((previous) => ({ ...previous, [evidenceId]: "" }));

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

      const analysis = (await response.json()) as EvidenceAnalysis;
      setAnalyses((previous) => ({
        ...previous,
        [evidenceId]: analysis,
      }));
    } catch (err) {
      setAnalysisErrors((previous) => ({
        ...previous,
        [evidenceId]:
          err instanceof Error ? err.message : "Could not analyze evidence",
      }));
    } finally {
      setAnalysisLoading((previous) => ({
        ...previous,
        [evidenceId]: false,
      }));
    }
  }

  async function runComparison() {
    setComparisonRunning(true);
    setComparisonError("");

    try {
      const response = await fetch(
        `${API_URL}/jobs/${jobId}/evidence/compare`,
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
            : `Comparison failed (${response.status})`;
        throw new Error(detail);
      }

      const report = (await response.json()) as ComparisonReport;
      setComparison(report);
    } catch (err) {
      setComparisonError(
        err instanceof Error ? err.message : "Could not compare evidence",
      );
    } finally {
      setComparisonRunning(false);
    }
  }

  const beforeCount = items.filter((item) =>
    ["before", "before_service"].includes(item.evidence_type),
  ).length;
  const afterCount = items.filter((item) =>
    ["after", "after_service"].includes(item.evidence_type),
  ).length;
  const canCompare = beforeCount > 0 && afterCount > 0;

  return (
    <section className="job-evidence-section">
      <h3 className="job-evidence-title">Proof of Work</h3>

      {loading && <p>Loading evidence...</p>}
      {error && <p className="error-message" role="alert">{error}</p>}

      {!loading && !error && items.length === 0 && (
        <p className="evidence-empty-text">No evidence has been uploaded yet.</p>
      )}

      {!loading && items.length > 0 && (
        <section
          aria-labelledby="comparison-heading"
          className="evidence-comparison-card"
        >
          <h4 id="comparison-heading">Before/After AI Comparison</h4>
          <p className="evidence-comparison-subtitle">
            {beforeCount} before image(s) and {afterCount} after image(s)
            available. The AI compares the available images together in one
            request.
          </p>

          <button
            type="button"
            className="primary-button"
            onClick={() => void runComparison()}
            disabled={!canCompare || comparisonRunning || comparisonLoading}
          >
            {comparisonRunning
              ? "Comparing images..."
              : comparison
                ? "Run comparison again"
                : "Compare before and after"}
          </button>

          {!canCompare && (
            <p className="evidence-hint">
              Upload at least one before image and one after image to enable
              comparison.
            </p>
          )}

          {comparisonLoading && <p>Loading saved comparison...</p>}
          {comparisonError && (
            <p className="error-message" role="alert">
              {comparisonError}
            </p>
          )}

          {comparison && (
            <div className="evidence-analysis-box">
              <p>
                <strong>Assessment:</strong>{" "}
                <span className={`status-badge status-${comparison.result.assessment}`}>
                  {formatAssessment(comparison.result.assessment)}
                </span>
              </p>
              <p>
                <strong>Job relevance:</strong>{" "}
                {comparison.result.job_relevance}
              </p>
              <p>
                <strong>Model:</strong> {comparison.model_name}
              </p>
              <p>
                <strong>Compared:</strong>{" "}
                {new Date(comparison.created_at).toLocaleString()}
              </p>
              <p>
                <strong>Images compared:</strong>{" "}
                {comparison.before_evidence_ids.length} before,{" "}
                {comparison.after_evidence_ids.length} after
              </p>

              {renderStringList(
                "Before observations",
                comparison.result.before_observations ?? [],
              )}
              {renderStringList(
                "After observations",
                comparison.result.after_observations ?? [],
              )}
              {renderStringList(
                "Changes observed",
                comparison.result.changes_observed ?? [],
              )}
              {renderStringList(
                "Potential issues",
                comparison.result.potential_issues ?? [],
              )}
              {renderStringList(
                "Limitations",
                comparison.result.limitations ?? [],
              )}

              <p className="evidence-disclaimer">
                <small>
                  AI comparison is an aid to reviewing evidence, not
                  independent proof that the work was completed.
                </small>
              </p>
            </div>
          )}
        </section>
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
            className="evidence-item-card"
          >
            <h4>{item.evidence_type.replaceAll("_", " ")}</h4>

            <img
              src={imageUrl}
              alt={item.description || item.evidence_type}
              loading="lazy"
              className="evidence-image-preview"
            />

            <p><strong>File:</strong> {item.original_filename}</p>
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

            {item.latitude !== null && item.longitude !== null && (
              <p>
                <strong>Location:</strong> {item.latitude}, {item.longitude}
              </p>
            )}

            {item.description && <p>{item.description}</p>}

            {item.checklist && (
              <div className="evidence-json-section">
                <strong>Checklist</strong>
                <pre className="evidence-json-block">{JSON.stringify(item.checklist, null, 2)}</pre>
              </div>
            )}

            {item.measurements && (
              <div className="evidence-json-section">
                <strong>Measurements</strong>
                <pre className="evidence-json-block">{JSON.stringify(item.measurements, null, 2)}</pre>
              </div>
            )}

            <hr className="evidence-divider" />
            <h4>AI Evidence Analysis</h4>

            <button
              type="button"
              className="secondary-button"
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
              <div className="evidence-analysis-box">
                <p>
                  <strong>Assessment:</strong>{" "}
                  <span className={`status-badge status-${analysis.result.assessment}`}>
                    {formatAssessment(analysis.result.assessment)}
                  </span>
                </p>
                <p>
                  <strong>Job relevance:</strong>{" "}
                  {analysis.result.job_relevance}
                </p>
                <p><strong>Model:</strong> {analysis.model_name}</p>
                <p>
                  <strong>Analyzed:</strong>{" "}
                  {new Date(analysis.created_at).toLocaleString()}
                </p>

                {renderStringList(
                  "Observations",
                  analysis.result.observations ?? [],
                )}
                {renderStringList(
                  "Potential issues",
                  analysis.result.potential_issues ?? [],
                )}
                {renderStringList(
                  "Limitations",
                  analysis.result.limitations ?? [],
                )}

                <p className="evidence-disclaimer">
                  <small>
                    AI analysis is an aid to reviewing evidence, not
                    independent proof that the work was completed.
                  </small>
                </p>
              </div>
            )}

            {!analysis && !isAnalyzing && !currentAnalysisError && (
              <p className="evidence-hint">
                No saved analysis is available. Select Analyze evidence to
                evaluate this image against the service request.
              </p>
            )}
          </article>
        );
      })}
    </section>
  );
}

