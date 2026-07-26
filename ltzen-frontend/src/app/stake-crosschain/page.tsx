"use client";

import { CrossChainStakeWizard } from "@/components/stake-crosschain/CrossChainStakeWizard";

/**
 * Cross-chain stake (Wave A): Base ZEN → InboundStation → StLighter depositWithSig (payer=Station).
 * Redeem to Base is Wave B (out of scope).
 */
export default function StakeCrosschainPage() {
  return (
    <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
      <CrossChainStakeWizard />
    </div>
  );
}
