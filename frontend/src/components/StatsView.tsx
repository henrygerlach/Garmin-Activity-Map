import { useMemo } from "react";
import type { Activity, DailyMetric } from "../types";
import { ACTIVITY_COLORS, CHART_NEUTRAL } from "../lib/colors";
import { formatDistance, formatDistanceCompact, formatDurationCompact } from "../lib/format";
import {
  computeByDayOfWeek,
  computeByHourOfDay,
  computeDailyActivity,
  computeSummary,
  computeWeekBuckets,
  computeWeeklyAvgHr,
  computeWeeklyAvgSpeedKmh,
  computeWeeklyDailyAvg,
  computeWeeklyDistanceKm,
  computeWeeklySteps,
  computeWellnessSummary,
} from "../lib/stats";
import { BarChart } from "./BarChart";
import { CalendarHeatmap } from "./CalendarHeatmap";
import { LineChart } from "./LineChart";

interface StatTileProps {
  label: string;
  value: string;
  hint?: string;
}

function StatTile({ label, value, hint }: StatTileProps) {
  return (
    <div className="stat-tile">
      <div className="stat-tile__value">{value}</div>
      <div className="stat-tile__label">{label}</div>
      {hint && <div className="stat-tile__hint">{hint}</div>}
    </div>
  );
}

interface StatsViewProps {
  activities: Activity[];
  dailyMetrics: DailyMetric[];
}

// Thin x-axis labels so a chart stays legible regardless of how many weeks
// of history have accumulated — aim for roughly a dozen visible labels.
function labelStride(pointCount: number): number {
  return Math.max(1, Math.ceil(pointCount / 12));
}

// The weekly charts hold the whole history and scroll; these are how much of
// it a card shows at rest, newest first. A card with a row to itself gets a
// year, which stays comparable at a glance; a card sharing its row gets six
// months, since the same year at half the width is unreadable.
const VISIBLE_WEEKS = 52;
const VISIBLE_WEEKS_HALF_ROW = 26;

// The day-of-week and hour-of-day charts have no time axis to scroll, so they
// stay on a rolling twelve months rather than averaging away recent habits.
const RECENT_WINDOW_DAYS = 365;

function withinRecentWindow(activities: Activity[]): Activity[] {
  const cutoff = Date.now() - RECENT_WINDOW_DAYS * 86_400_000;
  return activities.filter((a) => new Date(a.start_time).getTime() >= cutoff);
}

export function StatsView({ activities, dailyMetrics }: StatsViewProps) {
  const summary = useMemo(() => computeSummary(activities), [activities]);
  const wellness = useMemo(() => computeWellnessSummary(dailyMetrics), [dailyMetrics]);
  const recent = useMemo(() => withinRecentWindow(activities), [activities]);
  const weekBuckets = useMemo(() => computeWeekBuckets(activities), [activities]);
  const weeklySteps = useMemo(() => computeWeeklySteps(weekBuckets, dailyMetrics), [weekBuckets, dailyMetrics]);
  const weeklyRestingHr = useMemo(
    () => computeWeeklyDailyAvg(weekBuckets, dailyMetrics, (m) => m.resting_hr),
    [weekBuckets, dailyMetrics],
  );
  const weeklyWakingHr = useMemo(
    () => computeWeeklyDailyAvg(weekBuckets, dailyMetrics, (m) => m.waking_avg_hr),
    [weekBuckets, dailyMetrics],
  );
  const weeklyHrv = useMemo(
    () => computeWeeklyDailyAvg(weekBuckets, dailyMetrics, (m) => m.hrv_last_night_avg),
    [weekBuckets, dailyMetrics],
  );
  const weeklyRunDistance = useMemo(
    () => computeWeeklyDistanceKm(weekBuckets, activities, "run"),
    [weekBuckets, activities],
  );
  const weeklyBikeDistance = useMemo(
    () => computeWeeklyDistanceKm(weekBuckets, activities, "bike"),
    [weekBuckets, activities],
  );
  const weeklyWalkSpeed = useMemo(
    () => computeWeeklyAvgSpeedKmh(weekBuckets, activities, "walk"),
    [weekBuckets, activities],
  );
  const weeklyRunSpeed = useMemo(
    () => computeWeeklyAvgSpeedKmh(weekBuckets, activities, "run"),
    [weekBuckets, activities],
  );
  const weeklyBikeSpeed = useMemo(
    () => computeWeeklyAvgSpeedKmh(weekBuckets, activities, "bike"),
    [weekBuckets, activities],
  );
  const weeklyWalkHr = useMemo(() => computeWeeklyAvgHr(weekBuckets, activities, "walk"), [weekBuckets, activities]);
  const weeklyRunHr = useMemo(() => computeWeeklyAvgHr(weekBuckets, activities, "run"), [weekBuckets, activities]);
  const weeklyBikeHr = useMemo(() => computeWeeklyAvgHr(weekBuckets, activities, "bike"), [weekBuckets, activities]);
  const byDay = useMemo(() => computeByDayOfWeek(recent), [recent]);
  const byHour = useMemo(() => computeByHourOfDay(recent), [recent]);
  const dailyActivity = useMemo(() => computeDailyActivity(activities), [activities]);

  if (activities.length === 0) {
    return <p className="empty-state">Nothing logged yet. Sync to pull your walks, runs and rides from Garmin Connect.</p>;
  }

  const weeklyLabelEvery = labelStride(Math.min(weekBuckets.length, VISIBLE_WEEKS));
  const halfRowLabelEvery = labelStride(Math.min(weekBuckets.length, VISIBLE_WEEKS_HALF_ROW));

  return (
    <div className="stats-view">
      <div className="stat-panel">
        <div className="stat-tile-grid">
          <StatTile label="Activities" value={String(summary.totalActivities)} />
          <StatTile label="Walked" value={formatDistanceCompact(summary.totalDistanceM.walk)} />
          <StatTile label="Ran" value={formatDistanceCompact(summary.totalDistanceM.run)} />
          <StatTile label="Cycled" value={formatDistanceCompact(summary.totalDistanceM.bike)} />
          <StatTile label="Time moving" value={formatDurationCompact(summary.totalMovingSeconds)} />
          <StatTile label="Longest walk" value={formatDistance(summary.longestM.walk)} />
          <StatTile label="Longest run" value={formatDistance(summary.longestM.run)} />
          <StatTile label="Longest ride" value={formatDistance(summary.longestM.bike)} />
          <StatTile label="Climbed" value={`${Math.round(summary.totalElevationGainM).toLocaleString()} m`} />
          <StatTile
            label="Steps"
            value={wellness.totalSteps.toLocaleString()}
            hint="All-day totals"
          />
          <StatTile
            label="Resting heart rate"
            value={wellness.latestRestingHr === null ? "—" : `${wellness.latestRestingHr} bpm`}
            hint={wellness.avgRestingHr === null ? undefined : `30-day avg ${wellness.avgRestingHr} bpm`}
          />
          <StatTile
            label="HRV overnight"
            value={wellness.latestHrv === null ? "—" : `${wellness.latestHrv} ms`}
            hint={wellness.avgHrv === null ? undefined : `30-day avg ${wellness.avgHrv} ms`}
          />
        </div>
      </div>

      <div className="chart-grid">
        <section className="chart-card chart-card--wide">
          <h2>Activity calendar</h2>
          <p className="chart-card__subtitle">Daily distance, all activity types combined</p>
          <CalendarHeatmap days={dailyActivity} />
        </section>

        <section className="chart-card chart-card--wide">
          <h2>Weekly steps</h2>
          <p className="chart-card__subtitle">All-day totals from Garmin, not only steps taken during an activity</p>
          <BarChart
            data={weeklySteps}
            color={ACTIVITY_COLORS.walk}
            valueFormatter={(v) => `${v.toLocaleString()} steps`}
            labelEvery={weeklyLabelEvery}
            visibleBuckets={VISIBLE_WEEKS}
          />
        </section>
        <section className="chart-card">
          <h2>Weekly running distance</h2>
          <p className="chart-card__subtitle">Last six months; scroll back for the rest</p>
          <BarChart
            data={weeklyRunDistance}
            color={ACTIVITY_COLORS.run}
            valueFormatter={(v) => `${v.toFixed(1)} km`}
            labelEvery={halfRowLabelEvery}
            visibleBuckets={VISIBLE_WEEKS_HALF_ROW}
          />
        </section>
        <section className="chart-card">
          <h2>Weekly cycling distance</h2>
          <p className="chart-card__subtitle">Last six months; scroll back for the rest</p>
          <BarChart
            data={weeklyBikeDistance}
            color={ACTIVITY_COLORS.bike}
            valueFormatter={(v) => `${v.toFixed(1)} km`}
            labelEvery={halfRowLabelEvery}
            visibleBuckets={VISIBLE_WEEKS_HALF_ROW}
          />
        </section>

        <section className="chart-card">
          <h2>Speed progression</h2>
          <p className="chart-card__subtitle">Weekly average moving speed (excludes time stopped)</p>
          <LineChart
            series={[
              { name: "Walk", color: ACTIVITY_COLORS.walk, data: weeklyWalkSpeed },
              { name: "Run", color: ACTIVITY_COLORS.run, data: weeklyRunSpeed },
              { name: "Bike", color: ACTIVITY_COLORS.bike, data: weeklyBikeSpeed, dashed: true },
            ]}
            valueFormatter={(v) => `${v.toFixed(1)} km/h`}
            labelEvery={halfRowLabelEvery}
            visiblePoints={VISIBLE_WEEKS_HALF_ROW}
          />
        </section>
        <section className="chart-card">
          <h2>Heart rate progression</h2>
          <p className="chart-card__subtitle">Weekly average heart rate</p>
          <LineChart
            series={[
              { name: "Walk", color: ACTIVITY_COLORS.walk, data: weeklyWalkHr },
              { name: "Run", color: ACTIVITY_COLORS.run, data: weeklyRunHr },
              { name: "Bike", color: ACTIVITY_COLORS.bike, data: weeklyBikeHr, dashed: true },
            ]}
            valueFormatter={(v) => `${Math.round(v)} bpm`}
            labelEvery={halfRowLabelEvery}
            visiblePoints={VISIBLE_WEEKS_HALF_ROW}
          />
        </section>

        <section className="chart-card">
          <h2>Heart rate awake and at rest</h2>
          <p className="chart-card__subtitle">
            Weekly averages of every sample taken while awake, and of Garmin's overnight resting reading
          </p>
          <LineChart
            series={[
              { name: "Awake", color: ACTIVITY_COLORS.walk, data: weeklyWakingHr },
              { name: "Resting", color: CHART_NEUTRAL, data: weeklyRestingHr },
            ]}
            valueFormatter={(v) => `${Math.round(v)} bpm`}
            labelEvery={halfRowLabelEvery}
            visiblePoints={VISIBLE_WEEKS_HALF_ROW}
          />
        </section>
        <section className="chart-card">
          <h2>Heart rate variability</h2>
          <p className="chart-card__subtitle">Weekly average of the overnight HRV average</p>
          <LineChart
            series={[{ name: "HRV", color: CHART_NEUTRAL, data: weeklyHrv }]}
            valueFormatter={(v) => `${Math.round(v)} ms`}
            labelEvery={halfRowLabelEvery}
            visiblePoints={VISIBLE_WEEKS_HALF_ROW}
          />
        </section>

        <section className="chart-card">
          <h2>Activities by day of week</h2>
          <BarChart data={byDay} color={CHART_NEUTRAL} valueFormatter={(v) => `${v} activities`} />
        </section>
        <section className="chart-card">
          <h2>Activities by hour of day</h2>
          <BarChart data={byHour} color={CHART_NEUTRAL} valueFormatter={(v) => `${v} activities`} labelEvery={3} />
        </section>
      </div>
    </div>
  );
}
