import { getLocalSession } from "./session";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function headers(): Promise<HeadersInit> {
  const session = await getLocalSession();
  const result: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (session?.token) {
    result.Authorization = `Bearer ${session.token}`;
  }
  return result;
}

export async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(path, {
    method: "GET",
    headers: await headers(),
    credentials: "same-origin",
  });
  return readJson<T>(response);
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    headers: await headers(),
    credentials: "same-origin",
    body: JSON.stringify(body),
  });
  return readJson<T>(response);
}

async function readJson<T>(response: Response): Promise<T> {
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) {
    throw new ApiError(data.error ?? "The server could not complete that request.", response.status);
  }
  return data;
}
