"use client";

/**
 * Stake page (uiux §4). Horizen-only same-chain deposit.
 * Test ZEN faucet lives on Base (MockZEN) — see /stake-crosschain — not on Horizen OFT.
 */

import Link from "next/link";
import { useChainId, useReadContract } from "wagmi";
import { isActionAvailable } from "@/lib/chainGating";
import { HUB_CHAIN_ID } from "@/config/chains";
import { abis, horizenAddress } from "@/config/contracts";
import { copy } from "@/lib/copy";
import { ChainGuide } from "@/components/common/ChainGuide";
import { StakeForm } from "@/components/stake/StakeForm";

export default function StakePage() {
  const chainId = useChainId();
  const available = isActionAvailable("deposit", chainId);

  const stLighter = horizenAddress("stLighter");
  const pausedQuery = useReadContract({
    chainId: HUB_CHAIN_ID,
    address: stLighter,
    abi: abis.stLighter,
    functionName: "paused",
    query: { enabled: Boolean(stLighter && available), refetchInterval: 15_000 },
  });
  const isPaused = pausedQuery.data === true;

  return (
    <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
      {!available ? (
        <ChainGuide action="deposit" />
      ) : (
        <div className="space-y-5">
          <p className="max-w-xl text-sm text-zinc-400">
            {copy.stake.noFaucetOnHorizen}{" "}
            <Link
              href="/stake-crosschain"
              className="text-zinc-200 underline-offset-2 hover:text-white hover:underline"
            >
              {copy.stake.stakeFromBaseCta}
            </Link>
          </p>
          {isPaused && (
            <div className="max-w-xl rounded-lg border border-amber-400/20 bg-amber-400/[0.05] px-4 py-3 text-sm text-amber-100">
              {copy.stake.pausedBanner}
            </div>
          )}
          <StakeForm />
        </div>
      )}
    </div>
  );
}
