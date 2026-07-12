import { RareCrestApiClient } from "@rarecrest/api-client";

export const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

export const API_HEADERS: Record<string, string> = {
  "x-user-id": "director-1",
  "x-user-role": "director",
  "x-vertical": "holding",
};

export function createApiClient(): RareCrestApiClient {
  return new RareCrestApiClient({
    baseUrl: API_BASE,
    getHeaders: () => API_HEADERS,
  });
}
