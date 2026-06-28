/** Server-side relay debug logging. Set RELAY_DEBUG=1 for verbose poll traces. */

function isEnabled(): boolean {
  return process.env.RELAY_DEBUG === "1" || process.env.NODE_ENV !== "production";
}

export function relayVerbose(): boolean {
  return process.env.RELAY_DEBUG === "1";
}

export function relayLog(message: string, data?: Record<string, unknown>): void {
  if (!isEnabled()) return;
  if (data) console.log(`[relay-bff] ${message}`, data);
  else console.log(`[relay-bff] ${message}`);
}

export function relayError(message: string, err: unknown, data?: Record<string, unknown>): void {
  if (!isEnabled()) return;
  const base =
    err instanceof Error
      ? { error: err.message, stack: err.stack }
      : { error: String(err) };
  console.error(`[relay-bff] ${message}`, { ...base, ...data });
}
