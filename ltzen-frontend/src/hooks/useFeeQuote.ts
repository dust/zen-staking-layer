"use client";

import { useEffect, useState } from "react";
import type { Address, Hex } from "viem";
import type { RelayKind } from "@/relayer/types";
import {
  fetchFeeQuote,
  FeeQuoteError,
  type FeeQuote,
  type FetchFeeQuoteArgs,
} from "@/lib/feeQuote";

const DEBOUNCE_MS = 400;

export type UseFeeQuoteArgs = {
  kind: RelayKind;
  amount?: string;
  dest?: Address;
  extraOptions?: Hex;
  verifyingContract?: Address;
  /** When false, skip fetching (e.g. gasless off). */
  enabled?: boolean;
};

export function useFeeQuote(args: UseFeeQuoteArgs) {
  const [quote, setQuote] = useState<FeeQuote | undefined>();
  const [error, setError] = useState<FeeQuoteError | undefined>();
  const [loading, setLoading] = useState(false);
  const [fetchKey, setFetchKey] = useState("");

  const enabled = args.enabled !== false;
  // Escape-hatch withdraws are Direct-only and never quoted via BFF.
  const isWithdraw =
    args.kind === "withdrawToHorizen" || args.kind === "egressWithdrawToHorizen";
  const needsAmount = !isWithdraw;
  const canFetch =
    enabled &&
    !isWithdraw &&
    (!needsAmount || (Boolean(args.amount) && args.amount !== "0")) &&
    (args.kind !== "bridgeToBase" || Boolean(args.dest));

  const nextKey = canFetch
    ? [
        args.kind,
        args.amount ?? "",
        args.dest ?? "",
        args.extraOptions ?? "",
        args.verifyingContract ?? "",
      ].join("|")
    : "";

  useEffect(() => {
    if (!canFetch) {
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      setLoading(true);
      const req: FetchFeeQuoteArgs = {
        kind: args.kind,
        amount: args.amount,
        dest: args.dest,
        extraOptions: args.extraOptions,
        verifyingContract: args.verifyingContract,
      };
      void fetchFeeQuote(req)
        .then((q) => {
          if (cancelled) return;
          setQuote(q);
          setError(undefined);
          setFetchKey(nextKey);
        })
        .catch((err) => {
          if (cancelled) return;
          setQuote(undefined);
          setError(err instanceof FeeQuoteError ? err : new FeeQuoteError("unknown", String(err)));
          setFetchKey(nextKey);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    canFetch,
    nextKey,
    args.kind,
    args.amount,
    args.dest,
    args.extraOptions,
    args.verifyingContract,
  ]);

  const active = canFetch && fetchKey === nextKey;
  const activeQuote = active ? quote : undefined;
  const activeError = active ? error : undefined;

  const maxFeeZen = activeQuote ? BigInt(activeQuote.maxFeeZen) : 0n;
  const feeZen = activeQuote ? BigInt(activeQuote.feeZen) : undefined;

  return {
    quote: activeQuote,
    feeZen,
    maxFeeZen,
    error: activeError,
    loading: canFetch && (loading || fetchKey !== nextKey),
    ready: Boolean(activeQuote) && !activeError,
  };
}
