import garminConnectPkg from "garmin-connect";
type GarminConnect = InstanceType<typeof garminConnectPkg.GarminConnect>;

/**
 * Day-level wellness data: all-day steps, resting heart rate and overnight HRV.
 *
 * Separate from `garmin.ts` because it comes from a different part of Garmin's
 * API and has a different shape: three range endpoints keyed by calendar date,
 * where activities are per-record and keyed by id. The step count here is
 * Garmin's own daily total, which is the number the watch shows — the sum of
 * `activities.steps` only counts steps taken while an activity was recording.
 */

const GC_API_BASE = "https://connectapi.garmin.com";
// Garmin rejects a wider window on the stats endpoints: "difference in days
// between StartDate and EndDate cannot be more than 28 days". The HRV service
// accepts more, but it goes in the same windows so the three stay aligned.
const CHUNK_DAYS = 28;
const REQUEST_DELAY_MS = 300;

export interface DailyMetric {
  /** `YYYY-MM-DD`, the watch's calendar day. */
  calendar_date: string;
  total_steps: number | null;
  resting_hr: number | null;
  hrv_last_night_avg: number | null;
  waking_avg_hr: number | null;
}

interface StepsRow {
  calendarDate: string;
  totalSteps: number | null;
}

interface RestingHrRow {
  calendarDate: string;
  values: { restingHR: number | null } | null;
}

interface HrvSummary {
  calendarDate: string;
  lastNightAvg: number | null;
}

/** `[epoch millis, bpm]` pairs, roughly every two minutes, nulls where absent. */
interface DailyHeartRate {
  heartRateValues: [number, number | null][] | null;
}

interface DailySleep {
  dailySleepDTO: {
    /** Epoch millis, or null on a night the watch recorded no sleep. */
    sleepStartTimestampGMT: number | null;
    sleepEndTimestampGMT: number | null;
  } | null;
}

/** `[start, end]` epoch millis of one night's sleep. */
type SleepWindow = [number, number];

/**
 * Mean of the day's heart rate samples, sleep excluded — Garmin publishes a
 * resting, a min and a max for the day, but no average of the waking day.
 *
 * Sleep has to come out: eight hours near the resting rate drag the mean down
 * by 6–8 bpm and swamp the thing the number is for, which is how hard the day
 * itself was. Nights Garmin recorded no sleep need no window and get none —
 * on those days the watch was off, and the samples between 01:00 and 05:00 are
 * missing too, so there is nothing to exclude.
 *
 * A plain mean is safe here only because the samples are evenly spaced: they
 * arrive every two minutes, and weighting each one by the gap to the next
 * moved the answer by under 0.5 bpm across the days it was checked against.
 * Days the watch was off for a stretch are still averaged over the hours it
 * was worn, so they lean high — a partial day is better than no day.
 */
function wakingAverageHeartRate(daily: DailyHeartRate | null, asleep: SleepWindow[]): number | null {
  const values = (daily?.heartRateValues ?? [])
    .filter(([time, bpm]) => bpm !== null && !asleep.some(([from, to]) => time >= from && time <= to))
    .map(([, bpm]) => bpm as number);
  if (values.length === 0) return null;
  return Math.round(values.reduce((sum, bpm) => sum + bpm, 0) / values.length);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** `YYYY-MM-DD` in local time — the calendar day Garmin means, not a UTC one. */
export function toCalendarDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function addDays(date: Date, days: number): Date {
  const out = new Date(date);
  out.setDate(out.getDate() + days);
  return out;
}

/**
 * Fetches every day from `start` to `end` inclusive, in 28-day windows.
 *
 * Days Garmin knows nothing about are dropped rather than stored as a row of
 * nulls: the watch predates none of the activity history, so the early years
 * would otherwise fill the table with empty rows that say only "no watch yet".
 */
export async function fetchDailyMetrics(
  gc: GarminConnect,
  start: Date,
  end: Date,
  onProgress?: (message: string) => void,
): Promise<DailyMetric[]> {
  const byDate = new Map<string, DailyMetric>();

  // The sleep endpoint is the one call that needs the account's display name.
  const profile = await gc.client.get<{ displayName: string }>(`${GC_API_BASE}/userprofile-service/socialProfile`);
  const sleepByDate = new Map<string, SleepWindow | null>();
  const sleepWindow = async (calendarDate: string): Promise<SleepWindow | null> => {
    const cached = sleepByDate.get(calendarDate);
    if (cached !== undefined) return cached;
    const night = await gc.client.get<DailySleep>(
      `${GC_API_BASE}/wellness-service/wellness/dailySleepData/${profile.displayName}?date=${calendarDate}`,
    );
    const { sleepStartTimestampGMT: start, sleepEndTimestampGMT: end } = night?.dailySleepDTO ?? {};
    const window: SleepWindow | null = start != null && end != null ? [start, end] : null;
    sleepByDate.set(calendarDate, window);
    await sleep(REQUEST_DELAY_MS);
    return window;
  };

  for (let from = new Date(start); from <= end; from = addDays(from, CHUNK_DAYS)) {
    const to = addDays(from, CHUNK_DAYS - 1) > end ? end : addDays(from, CHUNK_DAYS - 1);
    const fromKey = toCalendarDate(from);
    const toKey = toCalendarDate(to);
    onProgress?.(`Fetching daily metrics ${fromKey} → ${toKey}`);

    const entry = (calendarDate: string): DailyMetric => {
      const existing = byDate.get(calendarDate);
      if (existing) return existing;
      const created: DailyMetric = {
        calendar_date: calendarDate,
        total_steps: null,
        resting_hr: null,
        hrv_last_night_avg: null,
        waking_avg_hr: null,
      };
      byDate.set(calendarDate, created);
      return created;
    };

    const steps = await gc.client.get<StepsRow[]>(
      `${GC_API_BASE}/usersummary-service/stats/steps/daily/${fromKey}/${toKey}`,
    );
    for (const row of steps ?? []) {
      if (row.totalSteps !== null && row.totalSteps !== undefined) {
        entry(row.calendarDate).total_steps = row.totalSteps;
      }
    }
    await sleep(REQUEST_DELAY_MS);

    const heartRate = await gc.client.get<RestingHrRow[]>(
      `${GC_API_BASE}/usersummary-service/stats/heartRate/daily/${fromKey}/${toKey}`,
    );
    for (const row of heartRate ?? []) {
      const resting = row.values?.restingHR;
      if (resting !== null && resting !== undefined) entry(row.calendarDate).resting_hr = resting;
    }
    await sleep(REQUEST_DELAY_MS);

    // Returns an empty string rather than an empty payload when the range
    // predates the first HRV recording, so this can't assume an object.
    const hrv = await gc.client.get<{ hrvSummaries: HrvSummary[] | null } | "">(
      `${GC_API_BASE}/hrv-service/hrv/daily/${fromKey}/${toKey}`,
    );
    for (const row of (typeof hrv === "object" && hrv ? hrv.hrvSummaries : null) ?? []) {
      if (row.lastNightAvg !== null && row.lastNightAvg !== undefined) {
        entry(row.calendarDate).hrv_last_night_avg = row.lastNightAvg;
      }
    }
    await sleep(REQUEST_DELAY_MS);

    // The only per-day call: the sample series has no range endpoint. It runs
    // for days the range calls above already found data for, so the years
    // before the watch cost nothing, and a routine sync covers a week.
    //
    // Garmin keeps these samples for about four months and then drops them —
    // resting heart rate survives, the series does not — so days older than
    // that come back empty and this column simply starts where the archive
    // does. Syncing regularly is what keeps it growing from here.
    for (let day = new Date(from); day <= to; day = addDays(day, 1)) {
      const key = toCalendarDate(day);
      if (!byDate.has(key)) continue;
      const daily = await gc.client.get<DailyHeartRate>(
        `${GC_API_BASE}/wellness-service/wellness/dailyHeartRate?date=${key}`,
      );
      await sleep(REQUEST_DELAY_MS);
      // Nothing to average and so nothing to exclude: don't pay for the sleep
      // calls on a day the watch went unworn, or one old enough that Garmin
      // has already dropped its samples.
      if (!daily?.heartRateValues?.some(([, bpm]) => bpm !== null)) continue;

      // Two nights touch one calendar day: the one ending on its morning, which
      // Garmin files under this date, and the one starting on its evening,
      // filed under tomorrow. The cache means each date is still fetched once.
      const nights = [await sleepWindow(key), await sleepWindow(toCalendarDate(addDays(day, 1)))];
      entry(key).waking_avg_hr = wakingAverageHeartRate(
        daily,
        nights.filter((night): night is SleepWindow => night !== null),
      );
    }
  }

  return [...byDate.values()].sort((a, b) => a.calendar_date.localeCompare(b.calendar_date));
}
