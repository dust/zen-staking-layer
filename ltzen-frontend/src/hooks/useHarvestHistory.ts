"use client";

import { useEffect, useState } from "react";
import {
  isSubgraphConfigured,
  subgraphQuery,
  type SubgraphStatus,
} from "@/lib/subgraph";

/**
 * Goldsky harvestEvents for Transparency HarvestHistory (uiux §7).
 */

export type HarvestRow = {
  blockTimestamp: number; // seconds
  rewardClaimed: bigint;
  feeTaken: bigint;
  restaked: bigint;
  transactionHash: string;
};

const HARVEST_QUERY_FIRST = 50;
const REFETCH_MS = 60_000;

const HARVESTS_QUERY = /* GraphQL */ `
  query Harvests($first: Int!) {
    harvestEvents(first: $first, orderBy: blockTimestamp, orderDirection: desc) {
      blockTimestamp
      rewardClaimed
      feeTaken
      restaked
      transactionHash
    }
  }
`;

type HarvestEventGql = {
  blockTimestamp: string;
  rewardClaimed: string;
  feeTaken: string;
  restaked: string;
  transactionHash: string;
};

type HarvestsData = {
  harvestEvents: HarvestEventGql[];
};

function mapRows(events: HarvestEventGql[]): HarvestRow[] {
  return events.map((e) => ({
    blockTimestamp: Number(e.blockTimestamp),
    rewardClaimed: BigInt(e.rewardClaimed),
    feeTaken: BigInt(e.feeTaken),
    restaked: BigInt(e.restaked),
    transactionHash: e.transactionHash,
  }));
}

export function useHarvestHistory(): {
  rows: HarvestRow[];
  status: SubgraphStatus;
} {
  const configured = isSubgraphConfigured();
  const [rows, setRows] = useState<HarvestRow[]>([]);
  const [status, setStatus] = useState<SubgraphStatus>(
    configured ? "loading" : "disabled",
  );

  useEffect(() => {
    if (!configured) {
      setStatus("disabled");
      return;
    }

    let cancelled = false;

    async function load() {
      try {
        const data = await subgraphQuery<HarvestsData>(HARVESTS_QUERY, {
          first: HARVEST_QUERY_FIRST,
        });
        if (cancelled) return;
        setRows(mapRows(data.harvestEvents));
        setStatus("ready");
      } catch {
        if (cancelled) return;
        setStatus("error");
      }
    }

    void load();
    const id = window.setInterval(() => void load(), REFETCH_MS);
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);

    return () => {
      cancelled = true;
      window.clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, [configured]);

  return { rows, status };
}
