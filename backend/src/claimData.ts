import "./env.js";

import { supabase } from "./supabase.js";

/**
 * One-time cleanup for the multi-user migration: pre-existing activities,
 * streams and daily metrics have no owner (`user_id is null`), which RLS
 * makes invisible to everyone. Run this once per pre-existing account, after
 * that person has signed up, to hand their old data to their new account.
 * Usage: `npm run claim-data -- <email>`.
 */
async function main(): Promise<void> {
  const email = process.argv[2];
  if (!email) throw new Error("Usage: npm run claim-data -- <email>");

  const { data, error } = await supabase.auth.admin.listUsers();
  if (error) throw error;
  const user = data.users.find((u) => u.email === email);
  if (!user) throw new Error(`No signed-up account found for ${email}`);

  for (const table of ["activities", "activity_streams", "daily_metrics"] as const) {
    const { error: updateError, count } = await supabase
      .from(table)
      .update({ user_id: user.id }, { count: "exact" })
      .is("user_id", null);
    if (updateError) throw updateError;
    console.log(`${table}: claimed ${count} row(s).`);
  }
}

main().catch((err) => {
  console.error("Claim failed:", err);
  process.exit(1);
});
