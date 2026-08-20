import { useMemo } from "react";
import type { Activity } from "../types";
import { ACTIVITY_COLORS, CHART_NEUTRAL } from "../lib/colors";
import { formatDistance, formatDistanceCompact, formatDurationCompact, formatHr } from "../lib/format";
import {
  computeByDayOfWeek,
  computeByHourOfDay,
  computeDailyActivity,
  computeSummary,
  computeWeekBuckets,
  computeWeeklyAvgHr,
  computeWeeklyAvgSpeedKmh,
  computeWeeklyDistanceKm,
} from "../lib/stats";
import { BarChart } from "./BarChart";
import { CalendarHeatmap } from "./CalendarHeatmap";
import { LineChart } from "./LineChart";

interface StatTileProps {
  label: string;
  value: string;
}

function StatTile({ label, value }: StatTileProps) {
  return (
    <div className="stat-tile">
      <div className="stat-tile__value">{value}</div>
      <div className="stat-tile__label">{label}</div>
    </div>
  );
}

interface StatsViewProps {
  activities: Activity[];
}

// Thin x-axis labels so a chart stays legible regardless of how many weeks
// of history have accumulated — aim for roughly a dozen visible labels.
function labelStride(pointCount: number): number {
  return Math.max(1, Math.ceil(pointCount / 12));
}

export function StatsView({ activities }: StatsViewProps) {
  const summary = useMemo(() => computeSummary(activities), [activities]);
  const weekBuckets = useMemo(() => computeWeekBuckets(activities), [activities]);
  const weeklyWalkDistance = useMemo(
    () => computeWeeklyDistanceKm(weekBuckets, activities, "walk"),
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
  const weeklyBikeSpeed = useMemo(
    () => computeWeeklyAvgSpeedKmh(weekBuckets, activities, "bike"),
    [weekBuckets, activities],
  );
  const weeklyWalkHr = useMemo(() => computeWeeklyAvgHr(weekBuckets, activities, "walk"), [weekBuckets, activities]);
  const weeklyBikeHr = useMemo(() => computeWeeklyAvgHr(weekBuckets, activities, "bike"), [weekBuckets, activities]);
  const byDay = useMemo(() => computeByDayOfWeek(activities), [activities]);
  const byHour = useMemo(() => computeByHourOfDay(activities), [activities]);
  const dailyActivity = useMemo(() => computeDailyActivity(activities), [activities]);

  if (activities.length === 0) {
    return <p className="empty-state">Nothing logged yet. Sync to pull your walks and rides from Garmin Connect.</p>;
  }

  const weeklyLabelEvery = labelStride(weekBuckets.length);

  return (
    <div className="stats-view">
      <div className="stat-panel">
        <div className="stat-tile-grid">
          <StatTile label="Activities" value={String(summary.totalActivities)} />
          <StatTile label="Walked" value={formatDistanceCompact(summary.totalWalkDistanceM)} />
          <StatTile label="Cycled" value={formatDistanceCompact(summary.totalBikeDistanceM)} />
          <StatTile label="Time moving" value={formatDurationCompact(summary.totalMovingSeconds)} />
          <StatTile
            label="Current streak"
            value={`${summary.currentStreakDays} day${summary.currentStreakDays === 1 ? "" : "s"}`}
          />
          <StatTile label="Longest walk" value={formatDistance(summary.longestWalkM)} />
          <StatTile label="Longest ride" value={formatDistance(summary.longestBikeM)} />
          <StatTile label="Avg heart rate" value={formatHr(summary.avgHr)} />
        </div>
      </div>

      <div className="chart-grid">
        <section className="chart-card chart-card--wide">
          <h2>Activity calendar</h2>
          <p className="chart-card__subtitle">Daily distance, all activity types combined</p>
          <CalendarHeatmap days={dailyActivity} />
        </section>

        <section className="chart-card chart-card--wide">
          <h2>Weekly walking distance</h2>
          <BarChart
            data={weeklyWalkDistance}
            color={ACTIVITY_COLORS.walk}
            valueFormatter={(v) => `${v.toFixed(1)} km`}
            labelEvery={weeklyLabelEvery}
          />
        </section>
        <section className="chart-card chart-card--wide">
          <h2>Weekly cycling distance</h2>
          <BarChart
            data={weeklyBikeDistance}
            color={ACTIVITY_COLORS.bike}
            valueFormatter={(v) => `${v.toFixed(1)} km`}
            labelEvery={weeklyLabelEvery}
          />
        </section>

        <section className="chart-card chart-card--wide">
          <h2>Speed progression</h2>
          <p className="chart-card__subtitle">Weekly average moving speed (excludes time stopped)</p>
          <LineChart
            series={[
              { name: "Walk", color: ACTIVITY_COLORS.walk, data: weeklyWalkSpeed },
              { name: "Bike", color: ACTIVITY_COLORS.bike, data: weeklyBikeSpeed, dashed: true },
            ]}
            valueFormatter={(v) => `${v.toFixed(1)} km/h`}
            labelEvery={weeklyLabelEvery}
          />
        </section>
        <section className="chart-card chart-card--wide">
          <h2>Heart rate progression</h2>
          <p className="chart-card__subtitle">Weekly average heart rate</p>
          <LineChart
            series={[
              { name: "Walk", color: ACTIVITY_COLORS.walk, data: weeklyWalkHr },
              { name: "Bike", color: ACTIVITY_COLORS.bike, data: weeklyBikeHr, dashed: true },
            ]}
            valueFormatter={(v) => `${Math.round(v)} bpm`}
            labelEvery={weeklyLabelEvery}
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
