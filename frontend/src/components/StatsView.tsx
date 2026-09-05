import { useMemo } from "react";
import type { Activity, ActivityKind, PaceHrStream } from "../types";
import { ACTIVITY_COLORS, CHART_NEUTRAL, periodColors } from "../lib/colors";
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
import { computeEfficiencyTrend, computeHrPaceCurve, computeWeeklyEfficiency } from "../lib/paceHr";
import { usePaceHrStreams } from "../lib/usePaceHrStreams";
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
}

// Thin x-axis labels so a chart stays legible regardless of how many weeks
// of history have accumulated — aim for roughly a dozen visible labels.
function labelStride(pointCount: number): number {
  return Math.max(1, Math.ceil(pointCount / 12));
}

// Charts cover a fixed twelve-month window rather than the whole logging
// history: a growing x-axis squeezes bars and week spacing until the shapes
// stop being comparable between visits. The summary tiles above stay all-time.
const CHART_WINDOW_DAYS = 365;

function withinChartWindow(activities: Activity[]): Activity[] {
  const cutoff = Date.now() - CHART_WINDOW_DAYS * 86_400_000;
  return activities.filter((a) => new Date(a.start_time).getTime() >= cutoff);
}

interface HrPaceCardProps {
  activities: Activity[];
  streams: PaceHrStream[];
  type: ActivityKind;
  title: string;
}

function HrPaceCard({ activities, streams, type, title }: HrPaceCardProps) {
  const curve = useMemo(() => computeHrPaceCurve(activities, streams, type), [activities, streams, type]);

  // A single quarter is a snapshot, not a progression: with nothing to compare
  // it against, the curve says only "heart rate rises with pace", which is not
  // news. The card appears once a second quarter of this activity exists.
  if (curve.series.length < 2) return null;

  const colors = periodColors(type, curve.series.length);

  return (
    <section className="chart-card chart-card--wide">
      <h2>{title}</h2>
      <p className="chart-card__subtitle">
        Average heart rate at each pace, one line per quarter. A line sitting lower than an earlier one means that
        pace now costs fewer beats per minute. The first five minutes of each activity are excluded, since heart
        rate lags pace at the start — but note that summer raises heart rate on its own, independently of fitness.
      </p>
      <LineChart
        series={curve.series.map((s, i) => ({ name: s.name, color: colors[i], data: s.data }))}
        valueFormatter={(v) => `${Math.round(v)} bpm`}
        labelEvery={labelStride(curve.bandLabels.length)}
      />
      <p className="chart-card__axis-label">Pace (km/h)</p>
    </section>
  );
}

export function StatsView({ activities }: StatsViewProps) {
  const summary = useMemo(() => computeSummary(activities), [activities]);
  const charted = useMemo(() => withinChartWindow(activities), [activities]);
  const weekBuckets = useMemo(() => computeWeekBuckets(charted), [charted]);
  const weeklyWalkDistance = useMemo(
    () => computeWeeklyDistanceKm(weekBuckets, charted, "walk"),
    [weekBuckets, charted],
  );
  const weeklyBikeDistance = useMemo(
    () => computeWeeklyDistanceKm(weekBuckets, charted, "bike"),
    [weekBuckets, charted],
  );
  const weeklyWalkSpeed = useMemo(
    () => computeWeeklyAvgSpeedKmh(weekBuckets, charted, "walk"),
    [weekBuckets, charted],
  );
  const weeklyBikeSpeed = useMemo(
    () => computeWeeklyAvgSpeedKmh(weekBuckets, charted, "bike"),
    [weekBuckets, charted],
  );
  const weeklyWalkHr = useMemo(() => computeWeeklyAvgHr(weekBuckets, charted, "walk"), [weekBuckets, charted]);
  const weeklyBikeHr = useMemo(() => computeWeeklyAvgHr(weekBuckets, charted, "bike"), [weekBuckets, charted]);
  const weeklyWalkEfficiency = useMemo(
    () => computeWeeklyEfficiency(weekBuckets, charted, "walk"),
    [weekBuckets, charted],
  );
  const weeklyBikeEfficiency = useMemo(
    () => computeWeeklyEfficiency(weekBuckets, charted, "bike"),
    [weekBuckets, charted],
  );
  const walkEfficiency = useMemo(() => computeEfficiencyTrend(activities, "walk"), [activities]);
  const byDay = useMemo(() => computeByDayOfWeek(charted), [charted]);
  const byHour = useMemo(() => computeByHourOfDay(charted), [charted]);
  const dailyActivity = useMemo(() => computeDailyActivity(charted), [charted]);
  const { streams, loading: streamsLoading, error: streamsError } = usePaceHrStreams();

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
          <StatTile
            label="Metres per heartbeat, walking"
            value={walkEfficiency.current === null ? "—" : walkEfficiency.current.toFixed(2)}
            hint={
              walkEfficiency.changePct === null
                ? "last 30 days"
                : `${walkEfficiency.changePct >= 0 ? "+" : ""}${walkEfficiency.changePct.toFixed(1)}% vs. first 30 days`
            }
          />
          <StatTile label="Climbed" value={`${Math.round(summary.totalElevationGainM).toLocaleString()} m`} />
          <StatTile label="Steps" value={summary.totalSteps.toLocaleString()} />
          <StatTile label="Calories" value={`${Math.round(summary.totalCalories).toLocaleString()} kcal`} />
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

        <section className="chart-card chart-card--wide">
          <h2>Efficiency progression</h2>
          <p className="chart-card__subtitle">
            Weekly average distance covered per heartbeat — rising means more ground for the same cardiac work
          </p>
          <LineChart
            series={[
              { name: "Walk", color: ACTIVITY_COLORS.walk, data: weeklyWalkEfficiency },
              { name: "Bike", color: ACTIVITY_COLORS.bike, data: weeklyBikeEfficiency, dashed: true },
            ]}
            valueFormatter={(v) => `${v.toFixed(2)} m/beat`}
            labelEvery={weeklyLabelEvery}
          />
        </section>

        {streamsError ? (
          <section className="chart-card chart-card--wide">
            <h2>Heart rate against pace</h2>
            <p className="empty-state">Could not load sensor data. {streamsError}</p>
          </section>
        ) : streamsLoading ? (
          <section className="chart-card chart-card--wide">
            <h2>Heart rate against pace</h2>
            <p className="empty-state">Loading sensor data…</p>
          </section>
        ) : (
          <>
            <HrPaceCard
              activities={charted}
              streams={streams}
              type="walk"
              title="Heart rate against pace — walks"
            />
            <HrPaceCard
              activities={charted}
              streams={streams}
              type="bike"
              title="Heart rate against pace — rides"
            />
          </>
        )}

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
