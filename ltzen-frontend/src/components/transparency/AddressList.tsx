"use client";

import { baseAddress, horizenAddress } from "@/config/contracts";
import { base, horizen } from "@/config/chains";
import { addressUrl, shortAddress } from "@/lib/explorer";
import { copy } from "@/lib/copy";
import { Card } from "@/components/common/Card";
import { CopyButton } from "@/components/common/CopyButton";

/**
 * AddressList (uiux §7) — the contract address book. Every configured address (proxy where
 * applicable) gets an explorer link + copy button so integrators can wire against the exact
 * deployment. Unconfigured entries are skipped rather than shown as broken links.
 */
export function AddressList() {
  const a = copy.transparency.addressLabels;

  const entries: { label: string; address?: string; chainId: number }[] = [
    { label: a.stLighterProxy, address: horizenAddress("stLighter"), chainId: horizen.id },
    { label: a.ltZEN, address: horizenAddress("ltZEN"), chainId: horizen.id },
    { label: a.zenStaker, address: horizenAddress("zenStaker"), chainId: horizen.id },
    { label: a.zen, address: horizenAddress("zen"), chainId: horizen.id },
    { label: a.baseLtZEN, address: baseAddress("ltZEN"), chainId: base.id },
  ];

  const configured = entries.filter((e) => e.address);

  return (
    <Card>
      <h2 className="text-sm font-medium text-white">{copy.transparency.addressesHeading}</h2>
      <p className="mt-1 text-xs text-zinc-500">{copy.transparency.addressesNote}</p>

      {configured.length === 0 ? (
        <p className="mt-4 text-sm text-zinc-500">{copy.states.notConfigured}</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {configured.map((e) => {
            const href = addressUrl(e.address!, e.chainId);
            const chainName = e.chainId === base.id ? base.name : horizen.name;
            return (
              <li
                key={e.label}
                className="flex flex-col gap-2 border-b border-white/5 pb-3 last:border-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="text-sm text-zinc-300">{e.label}</div>
                  <div className="text-[11px] text-zinc-500">{chainName}</div>
                </div>
                <div className="flex items-center gap-2">
                  {href ? (
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={copy.transparency.openExplorer}
                      className="rounded font-mono text-xs text-zinc-300 transition-colors hover:text-white hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400"
                    >
                      {shortAddress(e.address!)} <span aria-hidden>↗</span>
                    </a>
                  ) : (
                    <span className="font-mono text-xs text-zinc-300">
                      {shortAddress(e.address!)}
                    </span>
                  )}
                  <CopyButton value={e.address!} label={e.label} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
