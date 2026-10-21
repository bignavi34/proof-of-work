import { API_URL } from "./config";

export interface WorkSearchResponse {
  answer: string;
  tool_calls_made: number;
  model: string;
}

export async function searchWork(
  question: string,
): Promise<WorkSearchResponse> {
  const response = await fetch(`${API_URL}/ai/search`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ question }),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error("Your session has expired. Please sign in again.");
    }

    if (response.status === 403) {
      throw new Error("You don't have permission to perform this search.");
    }

    const detail =
      typeof data?.detail === "string" ? data.detail : null;

    throw new Error(
      detail || `AI search failed (${response.status}). Please try again.`,
    );
  }

  return data as WorkSearchResponse;
}

