-- Average heart rate across the waking day. Garmin publishes no such field, so
-- the sync averages the ~2-minute heart rate samples the watch records (see
-- `wellness.ts`), with the night's sleep window excluded — eight hours near the
-- resting rate drag the mean down by 6-8 bpm and hide what the day itself cost.
alter table public.daily_metrics add column waking_avg_hr smallint;
