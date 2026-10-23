// Shared helpers for stats panels. All figures come from observed/analysed records only.
import { useMemo } from "react";
import { SOURCES, activeObservations, useStore } from "../../store";
import { derive } from "../../logic/derive";
import type { Derived } from "../../logic/contract";

/** Derived state evaluated at the END of the analysed window (for full-window series). */
export function useDerivedFull(): Derived {
  const sourceId = useStore((s) => s.sourceId);
  const obsMap = useStore(activeObservations);
  const zones = useStore((s) => s.zones);
  const settings = useStore((s) => s.settings);
  const acked = useStore((s) => s.ackedAlerts);
  const reviews = useStore((s) => s.contactReviews);
  return useMemo(() => {
    const obs = Object.values(obsMap ?? {});
    const end = obs.reduce((m, o) => Math.max(m, o.t), 0);
    return derive(obs, zones, settings, end, acked, reviews, sourceId);
  }, [obsMap, zones, settings, acked, reviews, sourceId]);
}

export function useIsSynthetic(): boolean {
  const obsMap = useStore(activeObservations);
  return Object.values(obsMap ?? {}).some((o) => o.provenance === "synthetic");
}

export function useDuration(): number {
  const sourceId = useStore((s) => s.sourceId);
  return SOURCES.find((s) => s.id === sourceId)?.durationS ?? 1;
}
