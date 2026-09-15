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
  computeWeeklyAvg,
  computeWeeklyAvgSpeedKmh,
  computeWeeklyDailyAvg,
  computeWeeklyDistanceKm,
  computeWeeklySteps,
  computeWeeklyTss,
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
  const weeklyWalkHr = useMemo(
    () => computeWeeklyAvg(weekBuckets, activities, "walk", (a) => a.avg_hr),
    [weekBuckets, activities],
  );
  const weeklyRunHr = useMemo(
    () => computeWeeklyAvg(weekBuckets, activities, "run", (a) => a.avg_hr),
    [weekBuckets, activities],
  );
  const weeklyBikeHr = useMemo(
    () => computeWeeklyAvg(weekBuckets, activities, "bike", (a) => a.avg_hr),
    [weekBuckets, activities],
  );
  const weeklyAvgPower = useMemo(
    () => computeWeeklyAvg(weekBuckets, activities, "bike", (a) => a.avg_power_w),
    [weekBuckets, activities],
  );
  const weeklyNormPower = useMemo(
    () => computeWeeklyAvg(weekBuckets, activities, "bike", (a) => a.norm_power_w),
    [weekBuckets, activities],
  );
  const weeklyCadenceRpm = useMemo(
    () => computeWeeklyAvg(weekBuckets, activities, "bike", (a) => a.avg_cadence_rpm),
    [weekBuckets, activities],
  );
  const weeklyTss = useMemo(() => computeWeeklyTss(weekBuckets, activities), [weekBuckets, activities]);
  const byDay = useMemo(() => computeByDayOfWeek(recent), [recent]);
  const byHour = useMemo(() => computeByHourOfDay(recent), [recent]);
  const dailyActivity = useMemo(() => computeDailyActivity(activities), [activities]);
  // Power comes from the Wahoo meter, which is paired on a minority of rides —
  // with none of it, these cards would be three empty axes.
  const hasPower = useMemo(() => activities.some((a) => a.avg_power_w !== null), [activities]);

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

      <section className="chart-group">
        <h2 className="chart-group__title">Volume</h2>
        <div className="chart-grid">
          <section className="chart-card chart-card--wide">
            <h3>Activity calendar</h3>
            <p className="chart-card__subtitle">Daily distance, all activity types combined</p>
            <CalendarHeatmap days={dailyActivity} title="Activity calendar" />
          </section>

          <section className="chart-card chart-card--wide">
            <h3>Weekly steps</h3>
            <p className="chart-card__subtitle">All-day totals from Garmin, not only steps taken during an activity</p>
            <BarChart
              title="Weekly steps"
              data={weeklySteps}
              color={ACTIVITY_COLORS.walk}
              valueFormatter={(v) => `${v.toLocaleString()} steps`}
              labelEvery={weeklyLabelEvery}
              visibleBuckets={VISIBLE_WEEKS}
            />
          </section>
          <section className="chart-card">
            <h3>Weekly running distance</h3>
            <p className="chart-card__subtitle">Last six months; scroll back for the rest</p>
            <BarChart
              title="Weekly running distance"
              data={weeklyRunDistance}
              color={ACTIVITY_COLORS.run}
              valueFormatter={(v) => `${v.toFixed(1)} km`}
              labelEvery={halfRowLabelEvery}
              visibleBuckets={VISIBLE_WEEKS_HALF_ROW}
            />
          </section>
          <section className="chart-card">
            <h3>Weekly cycling distance</h3>
            <p className="chart-card__subtitle">Last six months; scroll back for the rest</p>
            <BarChart
              title="Weekly cycling distance"
              data={weeklyBikeDistance}
              color={ACTIVITY_COLORS.bike}
              valueFormatter={(v) => `${v.toFixed(1)} km`}
              labelEvery={halfRowLabelEvery}
              visibleBuckets={VISIBLE_WEEKS_HALF_ROW}
            />
          </section>
        </div>
      </section>

      <section className="chart-group">
        <h2 className="chart-group__title">Performance</h2>
        <div className="chart-grid">
          <section className="chart-card">
            <h3>Speed progression</h3>
            <p className="chart-card__subtitle">Weekly average moving speed (excludes time stopped)</p>
            <LineChart
              title="Speed progression"
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
            <h3>Heart rate progression</h3>
            <p className="chart-card__subtitle">Weekly average heart rate</p>
            <LineChart
              title="Heart rate progression"
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
        </div>
      </section>

      {hasPower && (
        <section className="chart-group">
          <h2 className="chart-group__title">Cycling</h2>
          <div className="chart-grid">
            <section className="chart-card">
              <h3>Cycling power</h3>
              <p className="chart-card__subtitle">
                Weekly average of each ride's average power, and of its normalised power
              </p>
              <LineChart
                title="Cycling power"
                series={[
                  { name: "Average", color: ACTIVITY_COLORS.bike, data: weeklyAvgPower },
                  { name: "Normalised", color: CHART_NEUTRAL, data: weeklyNormPower, dashed: true },
                ]}
                valueFormatter={(v) => `${Math.round(v)} W`}
                labelEvery={halfRowLabelEvery}
                visiblePoints={VISIBLE_WEEKS_HALF_ROW}
              />
            </section>
            <section className="chart-card">
              <h3>Cycling cadence</h3>
              <p className="chart-card__subtitle">Weekly average crank cadence from the power meter</p>
              <LineChart
                title="Cycling cadence"
                series={[{ name: "Cadence", color: ACTIVITY_COLORS.bike, data: weeklyCadenceRpm }]}
                valueFormatter={(v) => `${Math.round(v)} rpm`}
                labelEvery={halfRowLabelEvery}
                visiblePoints={VISIBLE_WEEKS_HALF_ROW}
              />
            </section>
            <section className="chart-card chart-card--wide">
              <h3>Cycling training load</h3>
              <p className="chart-card__subtitle">Training stress score, summed over each week</p>
              <BarChart
                title="Cycling training load"
                data={weeklyTss}
                color={ACTIVITY_COLORS.bike}
                valueFormatter={(v) => `${v} TSS`}
                labelEvery={weeklyLabelEvery}
                visibleBuckets={VISIBLE_WEEKS}
              />
            </section>
          </div>
        </section>
      )}

      <section className="chart-group">
        <h2 className="chart-group__title">Physiological</h2>
        <div className="chart-grid">
          <section className="chart-card">
            <h3>Heart rate awake and at rest</h3>
            <p className="chart-card__subtitle">
              Weekly averages of every sample taken while awake, and of Garmin's overnight resting reading
            </p>
            <LineChart
              title="Heart rate awake and at rest"
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
            <h3>Heart rate variability</h3>
            <p className="chart-card__subtitle">Weekly average of the overnight HRV average</p>
            <LineChart
              title="Heart rate variability"
              series={[{ name: "HRV", color: CHART_NEUTRAL, data: weeklyHrv }]}
              valueFormatter={(v) => `${Math.round(v)} ms`}
              labelEvery={halfRowLabelEvery}
              visiblePoints={VISIBLE_WEEKS_HALF_ROW}
            />
          </section>
        </div>
      </section>

      <section className="chart-group">
        <h2 className="chart-group__title">Habits</h2>
        <div className="chart-grid">
          <section className="chart-card">
            <h3>Activities by day of week</h3>
            <BarChart
              title="Activities by day of week"
              data={byDay}
              color={CHART_NEUTRAL}
              valueFormatter={(v) => `${v} activities`}
            />
          </section>
          <section className="chart-card">
            <h3>Activities by hour of day</h3>
            <BarChart
              title="Activities by hour of day"
              data={byHour}
              color={CHART_NEUTRAL}
              valueFormatter={(v) => `${v} activities`}
              labelEvery={3}
            />
          </section>
        </div>
      </section>
    </div>
  );
}
