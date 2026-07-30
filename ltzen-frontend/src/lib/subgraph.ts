/**
 * Goldsky / Graph GraphQL client for historical rate + harvest data.
 * Raw fetch only — no Apollo/urql (matches feeQuote.ts style).
 */

export type SubgraphStatus = "loading" | "ready" | "error" | "disabled";

const DEFAULT_TIMEOUT_MS = 10_000;

/** Trimmed Goldsky endpoint, or undefined when unset / blank. */
export function getSubgraphUrl(): string | undefined {
  const v = process.env.NEXT_PUBLIC_SUBGRAPH_URL?.trim();
  return v || undefined;
}

export function isSubgraphConfigured(): boolean {
  return getSubgraphUrl() !== undefined;
}

export class SubgraphError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SubgraphError";
  }
}

type GraphQlResponse<T> = {
  data?: T;
  errors?: Array<{ message?: string }>;
};

/**
 * POST a GraphQL query to NEXT_PUBLIC_SUBGRAPH_URL.
 * Throws SubgraphError when URL is missing, HTTP fails, or GraphQL returns errors.
 */
export async function subgraphQuery<T>(
  query: string,
  variables?: Record<string, unknown>,
  opts?: { timeoutMs?: number },
): Promise<T> {
  const url = getSubgraphUrl();
  if (!url) {
    throw new SubgraphError("NEXT_PUBLIC_SUBGRAPH_URL is not configured");
  }

  const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!res.ok) {
    throw new SubgraphError(`Subgraph HTTP ${res.status}`);
  }

  const body = (await res.json()) as GraphQlResponse<T>;
  if (body.errors?.length) {
    const msg = body.errors.map((e) => e.message ?? "unknown").join("; ");
    throw new SubgraphError(msg || "Subgraph GraphQL error");
  }
  if (body.data === undefined) {
    throw new SubgraphError("Subgraph returned no data");
  }
  return body.data;
}
