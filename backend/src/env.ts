import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

// Env vars live in the repo root .env (shared with the frontend), not backend/.env.
// This must be the first thing imported by index.ts, so it runs before any
// module that reads process.env at import time (e.g. supabase.ts).
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../.env") });
