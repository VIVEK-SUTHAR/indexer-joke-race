import { turso } from "./turso";

async function initializeDatabase() {
  try {
    await turso.executeMultiple(`
      CREATE TABLE IF NOT EXISTS processed_transactions (
        signature TEXT PRIMARY KEY,
        processed_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_signature ON processed_transactions(signature);
    `);
  } catch (error) {
    console.error("Error initializing database:", error);
    throw error;
  }
}
export default initializeDatabase;
