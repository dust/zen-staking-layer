/**
 * Write-path error classification (uiux-spec §8.2 错误归类与文案).
 *
 * Every write action (faucet / approve / deposit / redeem / bridge) funnels its thrown error
 * through `classifyTxError`, which maps the raw viem/wallet error to a stable {kind, message,
 * tone} the UI can render consistently. Keeping the table here (not inline per-hook) means the
 * §8.2 categories stay in one place and the copy stays on-tone.
 *
 *   §8.2 categories → kind:
 *     用户拒签        → "rejected"      (no error color, retryable)
 *     余额不足        → "insufficient-balance"
 *     授权不足        → "needs-approval"
 *     错链            → "wrong-chain"
 *     滑点/汇率变动    → "rate-moved"
 *     暂停            → "paused"
 *     gasless 中继超时 → "relayer-timeout"
 *     RPC 失败        → "rpc"
 *     其它            → "unknown"
 */

import { copy } from "./copy";

export type TxErrorKind =
  | "rejected"
  | "insufficient-balance"
  | "needs-approval"
  | "wrong-chain"
  | "rate-moved"
  | "paused"
  | "relayer-timeout"
  | "rpc"
  | "unknown";

/** `neutral` = user-driven, no error color (e.g. they cancelled). `error` = real failure. */
export type TxErrorTone = "neutral" | "error";

export interface ClassifiedTxError {
  kind: TxErrorKind;
  message: string;
  tone: TxErrorTone;
  /** True when retrying the same action makes sense (rejected / rpc / rate-moved / timeout). */
  retryable: boolean;
}

/** Marker error thrown by the relayer layer so we can classify a timeout precisely. */
export class RelayerTimeoutError extends Error {
  constructor(message = "relayer timeout") {
    super(message);
    this.name = "RelayerTimeoutError";
  }
}

function lower(err: unknown): string {
  if (!err) return "";
  if (typeof err === "string") return err.toLowerCase();
  const anyErr = err as { message?: string; shortMessage?: string; details?: string; cause?: unknown };
  const parts = [anyErr.shortMessage, anyErr.message, anyErr.details]
    .filter(Boolean)
    .join(" | ");
  const fromCause = anyErr.cause ? ` | ${lower(anyErr.cause)}` : "";
  return `${parts}${fromCause}`.toLowerCase();
}

/** Best-effort human string from viem/wallet errors (for UI + console). */
export function rawTxErrorMessage(err: unknown): string {
  if (!err) return "unknown error";
  if (typeof err === "string") return err;
  const anyErr = err as {
    shortMessage?: string;
    message?: string;
    details?: string;
    cause?: { shortMessage?: string; message?: string };
  };
  return (
    anyErr.shortMessage ||
    anyErr.cause?.shortMessage ||
    anyErr.message ||
    anyErr.cause?.message ||
    anyErr.details ||
    String(err)
  );
}

/**
 * Dev-friendly console dump. Always safe to call from catch blocks.
 */
export function logTxError(context: string, err: unknown): void {
  // Keep visible in production local debugging; browsers still gate by console filter.
  console.error(`[ltZEN:${context}]`, rawTxErrorMessage(err), err);
}

/**
 * Map a raw thrown error to a stable category. Pure (no I/O) so it's trivially testable and
 * safe to call from any hook's catch block.
 */
export function classifyTxError(err: unknown): ClassifiedTxError {
  if (err instanceof RelayerTimeoutError) {
    return {
      kind: "relayer-timeout",
      message: copy.errors.relayerTimeout,
      tone: "error",
      retryable: true,
    };
  }

  const text = lower(err);
  const detail = rawTxErrorMessage(err);

  // User rejected in wallet (viem UserRejectedRequestError / 4001). Neutral, not an error.
  if (
    text.includes("user rejected") ||
    text.includes("user denied") ||
    text.includes("rejected the request") ||
    text.includes("4001")
  ) {
    return { kind: "rejected", message: copy.errors.rejected, tone: "neutral", retryable: true };
  }

  // Contract paused — only deposit is blocked (redeem/view unaffected, PRD §7).
  if (text.includes("paused") || text.includes("enforcedpause")) {
    return { kind: "paused", message: copy.errors.paused, tone: "error", retryable: false };
  }

  if (
    text.includes("transfer amount exceeds balance") ||
    text.includes("insufficient balance") ||
    text.includes("exceeds balance")
  ) {
    return {
      kind: "insufficient-balance",
      message: copy.errors.insufficientBalance,
      tone: "error",
      retryable: false,
    };
  }

  if (text.includes("insufficient allowance") || text.includes("erc20: insufficient allowance")) {
    return {
      kind: "needs-approval",
      message: copy.errors.needsApproval,
      tone: "error",
      retryable: true,
    };
  }

  if (
    text.includes("chain mismatch") ||
    text.includes("does not match the target chain") ||
    text.includes("must match the active chainid") ||
    text.includes("wrong network")
  ) {
    return {
      kind: "wrong-chain",
      message: copy.errors.wrongChain,
      tone: "error",
      retryable: true,
    };
  }

  // LayerZero / OFT common reverts
  if (
    text.includes("no peer") ||
    text.includes("lz_path") ||
    text.includes("onlypeer") ||
    text.includes("invalidoptions") ||
    text.includes("notenoughnativeto") ||
    text.includes("0x6592671c") ||
    text.includes("lz_uln_invalidworkeroptions")
  ) {
    return {
      kind: "unknown",
      message:
        text.includes("0x6592671c") || text.includes("invalidworkeroptions")
          ? "LayerZero ULN rejected executor options (LZ_ULN_InvalidWorkerOptions). Type-3 options encoding was fixed — hard-refresh and retry bridge."
          : detail.slice(0, 240),
      tone: "error",
      retryable: true,
    };
  }

  // viem deadline / slippage-ish reverts during preview drift.
  if (text.includes("slippage") || (text.includes("rate") && text.includes("moved"))) {
    return { kind: "rate-moved", message: copy.errors.rateMoved, tone: "error", retryable: true };
  }

  if (text.includes("invalid signature") || text.includes("stlighter__invalidsignature")) {
    return { kind: "unknown", message: copy.errors.invalidSignature, tone: "error", retryable: true };
  }

  if (
    text.includes("fetch failed") ||
    text.includes("timeout") ||
    text.includes("network request failed") ||
    text.includes("http request failed") ||
    text.includes("internal json-rpc")
  ) {
    return { kind: "rpc", message: copy.errors.rpc, tone: "error", retryable: true };
  }

  // Prefer the wallet/viem short message over a opaque generic — needed for OFT/LZ debugging.
  const trimmed = detail.trim();
  if (trimmed && trimmed.toLowerCase() !== "error" && !trimmed.toLowerCase().startsWith("unknown")) {
    return {
      kind: "unknown",
      message: trimmed.length > 280 ? `${trimmed.slice(0, 277)}…` : trimmed,
      tone: "error",
      retryable: true,
    };
  }

  return { kind: "unknown", message: copy.errors.unknown, tone: "error", retryable: true };
}
