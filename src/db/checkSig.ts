import { turso } from "./turso";
import * as fs from "fs";
import * as path from "path";

const ERROR_LOG_DIR = "logs";
const ERROR_LOG_FILE = path.join(ERROR_LOG_DIR, "failed_signatures.log");

if (!fs.existsSync(ERROR_LOG_DIR)) {
  fs.mkdirSync(ERROR_LOG_DIR, { recursive: true });
}

function logFailedSignature(signature: string, error: any) {
  const timestamp = new Date().toISOString();
  const errorMessage = error instanceof Error ? error.message : String(error);
  const logEntry = `[${timestamp}] Signature: ${signature}\nError: ${errorMessage}\n${"-".repeat(50)}\n`;

  fs.appendFileSync(ERROR_LOG_FILE, logEntry, "utf8");
}

async function isSignatureProcessed(signature: string): Promise<boolean> {
  try {
    const result = await turso.execute({
      sql: "SELECT signature FROM processed_transactions WHERE signature = ?",
      args: [signature],
    });
    return result.rows.length > 0;
  } catch (error) {
    console.error("Error checking signature:", error);
    logFailedSignature(signature, error);
    throw error;
  }
}

export default isSignatureProcessed;
