import { turso } from "./turso";

async function initializeDatabase() {
  try {
    await turso.execute(`
      CREATE TABLE IF NOT EXISTS processed_transactions (
        signature TEXT PRIMARY KEY,
        processed_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await turso.execute(`

      CREATE INDEX IF NOT EXISTS idx_signature ON processed_transactions(signature);
`);
    console.log("Hellohh");
  } catch (error) {
    console.error("Error initializing database:", error);
    throw error;
  }
}
export default initializeDatabase;
