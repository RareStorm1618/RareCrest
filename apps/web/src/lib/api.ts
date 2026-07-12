import { RareCrestApiClient } from "@rarecrest/api-client";

export const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

/** Dev header shim — used only when no VITE_API_BEARER_TOKEN is set. */
export const API_HEADERS: Record<string, string> = {
  "x-user-id": "director-1",
  "x-user-role": "director",
  "x-vertical": "holding",
};

export function createApiClient(): RareCrestApiClient {
  return new RareCrestApiClient({
    baseUrl: API_BASE,
    getHeaders: () => {
      const bearer = import.meta.env.VITE_API_BEARER_TOKEN as string | undefined;
      if (bearer) {
        return { Authorization: `Bearer ${bearer}` };
      }
      return API_HEADERS;
    },
  });
}
