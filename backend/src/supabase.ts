import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment");
}

// Service role key bypasses RLS: this backend is the only writer.
export const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});
