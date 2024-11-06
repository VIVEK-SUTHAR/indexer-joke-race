import { turso } from "./turso";

async function clearAndResetDatabase() {
  try {
    await turso.executeMultiple(`
      DELETE FROM processed_transactions;
    `);
    console.log("Database cleared and reset successfully.");
  } catch (error) {
    console.error("Error clearing and resetting database:", error);
    throw error;
  }
}

export default clearAndResetDatabase;
