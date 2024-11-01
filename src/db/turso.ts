import { createClient } from "@libsql/client";
import * as path from "path";

const TURSO_DATABASE_URL = process.env.TURSO_DATABASE_URL;
const TURSO_AUTH_TOKEN = process.env.TURSO_AUTH_TOKEN;

if (!TURSO_AUTH_TOKEN || !TURSO_DATABASE_URL) {
  console.log("DB url or token not provided");
  process.exit(1);
}

const dbPath = path.resolve(__dirname, "../../sigdb.db");
const dbDir = path.dirname(dbPath);

export const turso = createClient({
  url: `file:${dbPath}`,
  syncUrl: TURSO_DATABASE_URL,
  authToken: TURSO_AUTH_TOKEN,
  syncInterval: 40,
});
