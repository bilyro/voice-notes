const BASE = import.meta.env.VITE_API_URL ?? "http://localhost:3000/api";

/** The API answered with an error status. (A network failure is a TypeError from fetch instead.) */
export class ApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/** True when the API refused the request (4xx), so sending it again won't help. 408 and 429 are worth a retry. */
export const isRefusal = (e: unknown) =>
  e instanceof ApiError && e.status >= 400 && e.status < 500 && e.status !== 408 && e.status !== 429;

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { credentials: "include", ...init });
  if (!res.ok) throw new ApiError((await res.json().catch(() => ({}))).error ?? res.statusText, res.status);
  return res.status === 204 ? (undefined as T) : res.json();
}
