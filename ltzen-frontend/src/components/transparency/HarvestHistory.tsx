"use client";

import type { ReactNode } from "react";
import { useHarvestHistory } from "@/hooks/useHarvestHistory";
import { copy } from "@/lib/copy";
import { Card } from "@/components/common/Card";
import { formatZenAmount } from "@/lib/format";
import { txUrl, shortAddress } from "@/lib/explorer";

/**
 * HarvestHistory (uiux §7) — lists Goldsky harvestEvents (time / claimed / fee / restake / tx).
 * Rate-neutral: harvests never bump the exchange rate (tone-guide §7 / design §0).
 */
export function HarvestHistory() {
  const { rows, status } = useHarvestHistory();

  let body: ReactNode;
  if (status === "disabled") {
    body = <Empty message={copy.transparency.harvestNotConfigured} />;
  } else if (status === "error") {
    body = <Empty message={copy.states.loadError} />;
  } else if (status === "loading" && rows.length === 0) {
    body = <Empty message={copy.states.apyAccumulating} />;
  } else if (rows.length === 0) {
    body = <Empty message={copy.transparency.harvestEmpty} />;
  } else {
    body = (
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[36rem] text-left text-sm">
          <thead>
            <tr className="border-b border-white/10 text-xs uppercase tracking-wide text-zinc-500">
              <th className="pb-2 pr-3 font-medium">{copy.transparency.harvestColTime}</th>
              <th className="pb-2 pr-3 font-medium">{copy.transparency.harvestColClaimed}</th>
              <th className="pb-2 pr-3 font-medium">{copy.transparency.harvestColFee}</th>
              <th className="pb-2 pr-3 font-medium">{copy.transparency.harvestColRestaked}</th>
              <th className="pb-2 font-medium">{copy.transparency.harvestColTx}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const href = txUrl(row.transactionHash);
              return (
                <tr
                  key={`${row.transactionHash}-${row.blockTimestamp}`}
                  className="border-b border-white/[0.06] text-zinc-300"
                >
                  <td className="py-2.5 pr-3 whitespace-nowrap text-zinc-400">
                    {formatHarvestTime(row.blockTimestamp)}
                  </td>
                  <td className="py-2.5 pr-3 font-mono text-xs">
                    {formatZenAmount(row.rewardClaimed, 6)}
                  </td>
                  <td className="py-2.5 pr-3 font-mono text-xs">
                    {formatZenAmount(row.feeTaken, 6)}
                  </td>
                  <td className="py-2.5 pr-3 font-mono text-xs">
                    {formatZenAmount(row.restaked, 6)}
                  </td>
                  <td className="py-2.5 font-mono text-xs">
                    {href ? (
                      <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-brand-green hover:underline"
                      >
                        {shortAddress(row.transactionHash)}
                      </a>
                    ) : (
                      shortAddress(row.transactionHash)
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <Card>
      <h2 className="font-display text-sm font-semibold tracking-tight text-white">
        {copy.transparency.harvestHeading}
      </h2>
      {body}
      <p className="mt-3 text-xs leading-relaxed text-zinc-500">{copy.microcopy.harvest}</p>
    </Card>
  );
}

function Empty({ message }: { message: string }) {
  return (
    <div className="mt-4 rounded-lg border border-dashed border-white/10 bg-white/[0.01] px-4 py-8 text-center">
      <p className="mx-auto max-w-md text-sm text-zinc-400">{message}</p>
    </div>
  );
}

function formatHarvestTime(tsSec: number): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(tsSec * 1000));
  } catch {
    return new Date(tsSec * 1000).toISOString();
  }
}
