/** Browser-side relay debug logging (dev or NEXT_PUBLIC_RELAY_DEBUG=1). */

export function relayClientLog(message: string, data?: Record<string, unknown>): void {
  if (
    process.env.NEXT_PUBLIC_RELAY_DEBUG !== "1" &&
    process.env.NODE_ENV === "production"
  ) {
    return;
  }
  if (data) console.log(`[relay-client] ${message}`, data);
  else console.log(`[relay-client] ${message}`);
}
