import type { Check, CheckRequest, Health, Sample } from "./types";

export class ApiError extends Error {
  readonly status: number; // 0 = network failure

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, init);
  } catch {
    throw new ApiError(0, "Cannot reach the StaleGuard API.");
  }
  if (!res.ok) {
    let message = `Request failed (${res.status}).`;
    try {
      const body: unknown = await res.json();
      if (typeof body === "object" && body !== null && "detail" in body) {
        const detail = (body as { detail: unknown }).detail;
        if (typeof detail === "string") message = detail;
        else if (res.status === 422) message = "The answer must be between 1 and 8000 characters.";
      }
    } catch {
      // body was not JSON; keep the generic message
    }
    throw new ApiError(res.status, message);
  }
  return (await res.json()) as T;
}

export const getHealth = () => request<Health>("/health");
export const getSamples = () => request<Sample[]>("/samples");
export const getCheck = (id: string) => request<Check>(`/checks/${encodeURIComponent(id)}`);
export const createCheck = (body: CheckRequest) =>
  request<{ id: string }>("/checks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
