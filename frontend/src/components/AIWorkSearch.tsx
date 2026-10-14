
import { useState } from "react";
import type { FormEvent } from "react";
import { searchWork } from "../api/ai";
import type { WorkSearchResponse } from "../api/ai";

interface AIWorkSearchProps {
  audience: "customer" | "admin";
}

const exampleQuestions = {
  customer: [
    "Show me my latest jobs and their statuses",
    "Which of my jobs are still in progress?",
    "Show me my completed work",
  ],
  admin: [
    "Show me the latest jobs and their statuses",
    "Which jobs have no technician assigned?",
    "Summarize the current job workload",
  ],
};

export default function AIWorkSearch({
  audience,
}: AIWorkSearchProps) {
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<WorkSearchResponse | null>(
    null,
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedQuestion = question.trim();

    if (!trimmedQuestion || loading) {
      return;
    }

    setLoading(true);
    setError("");
    setResult(null);

    try {
      const response = await searchWork(trimmedQuestion);
      setResult(response);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong while searching.",
      );
    } finally {
      setLoading(false);
    }
  }

  function useExample(example: string) {
    setQuestion(example);
    setError("");
  }

  return (
    <section className="ai-search-card">
      <div className="ai-search-heading">
        <div className="ai-search-icon" aria-hidden="true">
          AI
        </div>

        <div>
          <p className="eyebrow">AI assistant</p>
          <h2>
            {audience === "admin"
              ? "Search your operations"
              : "Ask about your work"}
          </h2>
          <p className="ai-search-description">
            {audience === "admin"
              ? "Ask questions about jobs, assignments and submitted evidence."
              : "Ask questions about your jobs, statuses and work records."}
          </p>
        </div>
      </div>

      <form className="ai-search-form" onSubmit={handleSubmit}>
        <label htmlFor={`ai-question-${audience}`}>
          What would you like to know?
        </label>

        <textarea
          id={`ai-question-${audience}`}
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder={
            audience === "admin"
              ? "e.g. Which jobs need a technician?"
              : "e.g. What is the status of my latest job?"
          }
          maxLength={2000}
          rows={3}
          required
          disabled={loading}
        />

        <div className="ai-search-form-footer">
          <span>{question.length}/2000 characters</span>

          <button
            className="primary-button"
            type="submit"
            disabled={loading || !question.trim()}
          >
            {loading ? "Searching..." : "Ask AI"}
          </button>
        </div>
      </form>

      <div className="ai-example-questions">
        <p>Try asking</p>

        <div className="ai-example-list">
          {exampleQuestions[audience].map((example) => (
            <button
              key={example}
              type="button"
              className="ai-example-button"
              onClick={() => useExample(example)}
              disabled={loading}
            >
              {example}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="ai-search-error" role="alert">
          <strong>Couldn't complete the search</strong>
          <p>{error}</p>
        </div>
      )}

      {result && (
        <section
          className="ai-search-result"
          aria-live="polite"
          aria-label="AI search result"
        >
          <div className="ai-result-heading">
            <h3>Answer</h3>
            <span>{result.tool_calls_made} tool calls</span>
          </div>

          <div className="ai-result-answer">{result.answer}</div>

          <p className="ai-result-disclaimer">
            AI-generated answer based on the records it retrieved.
            Verify important details against the original job records.
          </p>
        </section>
      )}
    </section>
  );
}

