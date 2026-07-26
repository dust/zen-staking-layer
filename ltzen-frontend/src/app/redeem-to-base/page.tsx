"use client";

import { RedeemToBaseWizard } from "@/components/redeem-to-base/RedeemToBaseWizard";

/** Redeem to Base (Wave B): Horizen ltZEN → EgressStation → Base ZEN @ B1. */
export default function RedeemToBasePage() {
  return (
    <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
      <RedeemToBaseWizard />
    </div>
  );
}
