"use client";

/**
 * Redeem page (uiux §5). Horizen-only write closure:
 *   - On Base (or wrong network): render ChainGuide — for redeem this guides "bridge back to
 *     Horizen first" (§5.2), since ltZEN on Base can't be redeemed locally.
 *   - On Horizen: RedeemForm. No paused() gating — redeeming is unaffected when deposits are
 *     paused (PRD §7).
 */

import { useChainId } from "wagmi";
import { isActionAvailable } from "@/lib/chainGating";
import { ChainGuide } from "@/components/common/ChainGuide";
import { RedeemForm } from "@/components/redeem/RedeemForm";

export default function RedeemPage() {
  const chainId = useChainId();
  const available = isActionAvailable("redeem", chainId);

  return (
    <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
      {!available ? <ChainGuide action="redeem" /> : <RedeemForm />}
    </div>
  );
}
