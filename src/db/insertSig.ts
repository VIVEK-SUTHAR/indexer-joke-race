import { turso } from "./turso";
import fs from "fs";
import path from "path";

const logFilePath = path.join(__dirname, "failed_signatures_insert.log");

async function markSignatureAsProcessed(signature: string): Promise<void> {
  const maxRetries = 3;
  let attempts = 0;

  while (attempts < maxRetries) {
    try {
      await turso.execute({
        sql: "INSERT INTO processed_transactions (signature) VALUES (?)",
        args: [signature],
      });
      break;
    } catch (error) {
      attempts++;
      console.error(
        `Error marking signature as processed (Attempt ${attempts}):`,
        error,
      );

      if (attempts === maxRetries) {
        logFailedSignature(signature);
      }
    }
  }
}

function logFailedSignature(signature: string): void {
  fs.appendFile(logFilePath, `${signature}\n`, (err) => {
    if (err) {
      console.error("Error writing to log file:", err);
    } else {
      console.log(`Logged failed signature: ${signature}`);
    }
  });
}

async function retryFailedSignatures(): Promise<void> {
  console.log("Retrying to process Failed Signatures...");
  if (!fs.existsSync(logFilePath)) return;

  const failedSignatures = fs
    .readFileSync(logFilePath, "utf-8")
    .split("\n")
    .filter(Boolean);

  for (const signature of failedSignatures) {
    await markSignatureAsProcessed(signature);
  }

  fs.truncate(logFilePath, 0, (err) => {
    if (err) {
      console.error("Error clearing log file:", err);
    } else {
      console.log("Cleared log file after processing.");
    }
  });
}
export { retryFailedSignatures };
export default markSignatureAsProcessed;
