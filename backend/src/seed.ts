import "./env.js";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { generateDemoHistory } from "./demoData.js";
import { supabase } from "./supabase.js";

/**
 * Replaces the database with a synthetic history, so the app can be
 * screenshotted and recorded for the README without publishing a real home
 * address or a real training log. See `demoData.ts` for how the history is
 * built. Usage:
 *
 *   npm run seed:demo      back up the real data, then wipe and seed
 *   npm run seed:restore   wipe the demo data and put the real data back
 *
 * The backup is what makes this safe to run on a working database: it holds
 * the real rows verbatim, so restoring is instant instead of a fresh Garmin
 * sync and backfill.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKUP_PATH = path.resolve(__dirname, "../.demo-backup.json");

// PostgREST caps how much it returns per request, and the stream rows are
// large, so both directions move in pages small enough to stay well inside it.
const READ_PAGE = 50;
const WRITE_CHUNK = 20;

interface Backup {
  savedAt: string;
  activities: Record<string, unknown>[];
  streams: Record<string, unknown>[];
}

async function readAll(table: string): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  for (let page = 0; ; page++) {
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .order("garmin_activity_id")
      .range(page * READ_PAGE, page * READ_PAGE + READ_PAGE - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if ((data?.length ?? 0) < READ_PAGE) return rows;
  }
}

async function insertAll(table: string, rows: Record<string, unknown>[]): Promise<void> {
  for (let i = 0; i < rows.length; i += WRITE_CHUNK) {
    const { error } = await supabase.from(table).insert(rows.slice(i, i + WRITE_CHUNK));
    if (error) throw error;
    process.stdout.write(`\r  ${table}: ${Math.min(i + WRITE_CHUNK, rows.length)}/${rows.length}`);
  }
  process.stdout.write("\n");
}

async function wipe(): Promise<void> {
  // `activity_streams` would go with its parent by cascade, but deleting it
  // first keeps the intent visible rather than relying on the schema.
  for (const table of ["activity_streams", "activities"]) {
    const { error } = await supabase.from(table).delete().gte("garmin_activity_id", 0);
    if (error) throw error;
  }
}

async function backup(): Promise<void> {
  if (fs.existsSync(BACKUP_PATH)) {
    // Almost certainly a re-run against a database that already holds demo
    // data; overwriting would replace the real backup with synthetic rows.
    console.log(`Backup already exists at ${BACKUP_PATH} — keeping it.`);
    console.log("Delete it by hand first if the current database really is the one you want backed up.");
    return;
  }

  console.log("Backing up the current database…");
  const data: Backup = {
    savedAt: new Date().toISOString(),
    activities: await readAll("activities"),
    streams: await readAll("activity_streams"),
  };
  fs.writeFileSync(BACKUP_PATH, JSON.stringify(data));
  const sizeMb = (fs.statSync(BACKUP_PATH).size / 1e6).toFixed(1);
  console.log(`  ${data.activities.length} activities, ${data.streams.length} stream rows → ${BACKUP_PATH} (${sizeMb} MB)`);
}

async function seed(): Promise<void> {
  await backup();

  console.log("Generating synthetic history…");
  const generated = generateDemoHistory();
  const points = generated.reduce((sum, g) => sum + g.activity.points.length, 0);
  console.log(`  ${generated.length} activities, ${points.toLocaleString()} track points`);

  console.log("Wiping…");
  await wipe();

  console.log("Inserting…");
  // The streams row is keyed by the activity's uuid, which only exists once the
  // parent row is written, so the insert has to hand the ids back.
  const idByGarminId = new Map<number, string>();
  const activities = generated.map((g) => g.activity);
  for (let i = 0; i < activities.length; i += WRITE_CHUNK) {
    const { data, error } = await supabase
      .from("activities")
      .insert(activities.slice(i, i + WRITE_CHUNK))
      .select("id, garmin_activity_id");
    if (error) throw error;
    for (const row of data ?? []) idByGarminId.set(row.garmin_activity_id as number, row.id as string);
    process.stdout.write(`\r  activities: ${idByGarminId.size}/${activities.length}`);
  }
  process.stdout.write("\n");
  await insertAll(
    "activity_streams",
    generated.map((g) => ({
      activity_id: idByGarminId.get(g.activity.garmin_activity_id),
      garmin_activity_id: g.activity.garmin_activity_id,
      ...g.streams,
    })),
  );

  console.log("Done. The app now shows synthetic data — run `npm run seed:restore` to get the real history back.");
}

async function restore(): Promise<void> {
  if (!fs.existsSync(BACKUP_PATH)) throw new Error(`No backup at ${BACKUP_PATH}`);

  const data = JSON.parse(fs.readFileSync(BACKUP_PATH, "utf8")) as Backup;
  console.log(`Restoring the backup taken ${data.savedAt}…`);

  await wipe();
  // Rows go back with their original uuids, so the streams' foreign keys still
  // point where they did.
  await insertAll("activities", data.activities);
  await insertAll("activity_streams", data.streams);

  fs.rmSync(BACKUP_PATH);
  console.log(`Done. ${data.activities.length} activities restored; backup file removed.`);
}

const task = process.argv.includes("--restore") ? restore : seed;
task().catch((error) => {
  console.error(error);
  process.exit(1);
});
