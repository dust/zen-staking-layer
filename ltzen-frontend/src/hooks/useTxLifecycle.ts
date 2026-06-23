"use client";

/**
 * useTxLifecycle — the one write-path state machine every action funnels through (uiux §8.1):
 *
 *   idle → validating → awaiting-signature → pending(txHash) → success | error
 *
 * It wraps the imperative `@wagmi/core` actions (via `useConfig()`) rather than the
 * `useWriteContract` hook so a multi-step flow (approve → deposit) can run as a single awaited
 * sequence with one evolving toast. Responsibilities:
 *   - drive the status machine + expose it for button labels
 *   - emit lifecycle toasts (pending → success/error) with the explorer link
 *   - classify failures via §8.2 (classifyTxError), so callers just `await run(...)`
 *
 * It does NOT know about deposit/redeem specifics — callers pass a writer thunk returning a tx
 * hash (or a terminal signal for gasless, which tracks elsewhere).
 */

import { useCallback, useId, useMemo, useRef, useState } from "react";
import { useConfig } from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";
import type { Config } from "wagmi";
import type { Hex } from "viem";
import { useToast } from "@/components/common/Toast";
import { classifyTxError, type ClassifiedTxError } from "@/lib/errors";
import { copy } from "@/lib/copy";

export type TxPhase =
  | "idle"
  | "validating"
  | "awaiting-signature"
  | "pending"
  | "success"
  | "error";

export interface TxState {
  phase: TxPhase;
  txHash?: Hex;
  error?: ClassifiedTxError;
}

export interface RunStep {
  /** Toast/label text while the wallet is open and while pending. */
  signingMessage: string;
  pendingMessage: string;
  successMessage: string;
  /** Performs the write; must return the broadcast tx hash. */
  send: (config: Config) => Promise<Hex>;
  /** Chain to wait the receipt on (defaults to the connected chain). */
  chainId?: number;
}

export interface TxLifecycle {
  state: TxState;
  isBusy: boolean;
  reset: () => void;
  /** Run one write step end-to-end (sign → broadcast → wait → toast). Resolves the receipt's
   *  tx hash on success; rejects with a ClassifiedTxError on failure. */
  runStep: (step: RunStep) => Promise<Hex>;
}

function explorerTxUrl(config: Config, chainId: number | undefined, hash: Hex): string | undefined {
  const chain = config.chains.find((c) => c.id === chainId) ?? config.chains[0];
  const base = chain?.blockExplorers?.default?.url;
  return base ? `${base.replace(/\/$/, "")}/tx/${hash}` : undefined;
}

export function useTxLifecycle(toastId?: string): TxLifecycle {
  const config = useConfig();
  const { push } = useToast();
  const [state, setState] = useState<TxState>({ phase: "idle" });
  const fallbackId = useId();
  const idRef = useRef(toastId ?? `tx-${fallbackId}`);

  const reset = useCallback(() => setState({ phase: "idle" }), []);

  const runStep = useCallback(
    async (step: RunStep): Promise<Hex> => {
      const id = idRef.current;
      try {
        setState({ phase: "awaiting-signature" });
        push({ id, tone: "pending", message: step.signingMessage });

        const hash = await step.send(config);

        setState({ phase: "pending", txHash: hash });
        push({
          id,
          tone: "pending",
          message: step.pendingMessage,
          explorerUrl: explorerTxUrl(config, step.chainId, hash),
          explorerLabel: copy.cta.viewExplorer,
        });

        await waitForTransactionReceipt(config, {
          hash,
          chainId: step.chainId as never,
        });

        setState({ phase: "success", txHash: hash });
        push({
          id,
          tone: "success",
          message: step.successMessage,
          explorerUrl: explorerTxUrl(config, step.chainId, hash),
          explorerLabel: copy.cta.viewExplorer,
        });
        return hash;
      } catch (err) {
        const classified = classifyTxError(err);
        setState({ phase: "error", error: classified });
        push({ id, tone: classified.tone === "neutral" ? "neutral" : "error", message: classified.message });
        throw classified;
      }
    },
    [config, push],
  );

  const isBusy = useMemo(
    () => state.phase === "awaiting-signature" || state.phase === "pending" || state.phase === "validating",
    [state.phase],
  );

  return { state, isBusy, reset, runStep };
}
