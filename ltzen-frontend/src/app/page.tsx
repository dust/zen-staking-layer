import { HeroRate } from "@/components/overview/HeroRate";
import { PositionCard } from "@/components/overview/PositionCard";
import { ProtocolStatsCard } from "@/components/overview/ProtocolStatsCard";
import { CompoundChart } from "@/components/overview/CompoundChart";

/**
 * Overview (M1). Public protocol data (rate / TVL / curve) renders without a wallet; the
 * PositionCard prompts to connect for personal data (uiux §8.4). All rate/stat reads come from
 * the Horizen hub regardless of the active chain.
 */
export default function Home() {
  return (
    <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
      <HeroRate />

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <CompoundChart />
        </div>
        <div className="space-y-6">
          <PositionCard />
          <ProtocolStatsCard />
        </div>
      </div>
    </div>
  );
}
