import type { SqlExecutor, SqlRow } from "./contracts";
export function createManagementApiExecutor(opts: {
  accessToken: string;
  projectRef: string;
  readOnly?: boolean;
}): SqlExecutor {
  const path = opts.readOnly ? "database/query/read-only" : "database/query";
  const url = `https://api.supabase.com/v1/projects/${opts.projectRef}/${path}`;
  return {
    async query<T extends SqlRow = SqlRow>(sql: string): Promise<T[]> {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${opts.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: sql }),
      });
      const text = await res.text();
      let body: unknown = null;
      try {
        body = text ? JSON.parse(text) : null;
      } catch {
        body = text;
      }
      if (!res.ok) {
        const message =
          body && typeof body === "object" && body !== null && "message" in body
            ? String((body as { message: unknown }).message)
            : text.slice(0, 400);
        throw new Error(`Supabase SQL ${res.status}: ${message}`);
      }
      if (Array.isArray(body)) return body as T[];
      if (body && typeof body === "object" && Array.isArray((body as { rows?: unknown }).rows)) {
        return (body as { rows: T[] }).rows;
      }
      return [];
    },
  };
}