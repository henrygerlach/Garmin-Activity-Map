import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import type { PaceHrStream } from "../types";

// PostgREST caps a single response, so the streams are read in pages. The cap
// is above the current activity count, but a silent truncation here would look
// like a genuine gap in the earliest history rather than an error.
const PAGE_SIZE = 500;

export interface PaceHrStreamsState {
  streams: PaceHrStream[];
  loading: boolean;
  error: string | null;
}

/**
 * Loads the pace and heart-rate series for every activity.
 *
 * Separate from the activity list on purpose: this is several megabytes of
 * sensor data that only the pace/heart-rate charts read. The statistics tab is
 * mounted only while it's open, so fetching on mount is what keeps this off
 * the initial page load.
 */
export function usePaceHrStreams(): PaceHrStreamsState {
  const [state, setState] = useState<PaceHrStreamsState>({ streams: [], loading: true, error: null });

  useEffect(() => {
    let cancelled = false;
    setState({ streams: [], loading: true, error: null });

    (async () => {
      const all: PaceHrStream[] = [];
      for (let page = 0; ; page++) {
        const { data, error } = await supabase
          .from("activity_streams")
          .select("garmin_activity_id, t_s, speed_mps, hr_bpm")
          .order("garmin_activity_id")
          .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

        if (cancelled) return;
        if (error) {
          setState({ streams: [], loading: false, error: error.message });
          return;
        }

        all.push(...((data ?? []) as PaceHrStream[]));
        if ((data?.length ?? 0) < PAGE_SIZE) break;
      }

      if (!cancelled) setState({ streams: all, loading: false, error: null });
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
