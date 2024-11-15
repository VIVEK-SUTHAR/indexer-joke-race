import type {
  Connection,
  PublicKey,
  GetSignaturesForAddressOptions,
} from "@solana/web3.js";
import isSignatureProcessed from "./db/checkSig";
import parseEvents from "./eventparser";
import markSignatureAsProcessed, {
  retryFailedSignatures,
} from "./db/insertSig";
import { writeLastProcessedSignatureToConfig } from "./utils";

type IndexVoteTxnOptions = {
  programId: PublicKey;
  connection: Connection;
  lastSignature: string | undefined;
  configFilePath: string;
};

const RATE_LIMIT = 120;
const RATE_WINDOW = 1000;
const CONCURRENT_REQUESTS = Math.floor(RATE_LIMIT * 0.8);

const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY = 1000;
const MAX_RETRY_DELAY = 10000;
const RETRY_FAILED_SIGNATURES_INTERVAL = 300000;
const BATCH_SIZE = 50;

const sleep = async (ms: number, reason: string = "Unspecified") => {
  console.log(`🛏️ Sleeping for ${ms}ms - Reason: ${reason}`);
  await new Promise((resolve) => setTimeout(resolve, ms));
  console.log(`⏰ Resumed after ${ms}ms sleep - Reason: ${reason}`);
};

const getRetryDelay = (attempt: number) => {
  return Math.min(INITIAL_RETRY_DELAY * Math.pow(2, attempt), MAX_RETRY_DELAY);
};

class RateLimiter {
  private requests: number[] = [];
  private lastLogTime: number = 0;
  private readonly LOG_INTERVAL = 5000;

  async checkLimit(): Promise<void> {
    const now = Date.now();
    this.requests = this.requests.filter((time) => now - time < RATE_WINDOW);

    if (now - this.lastLogTime > this.LOG_INTERVAL) {
      console.log(
        `📊 Current request rate: ${this.requests.length} requests in last ${RATE_WINDOW}ms`,
      );
      this.lastLogTime = now;
    }

    if (this.requests.length >= RATE_LIMIT) {
      const oldestRequest = this.requests[0];
      const waitTime = RATE_WINDOW - (now - oldestRequest);
      console.log(
        `⚠️ Rate limit approaching: ${this.requests.length}/${RATE_LIMIT} requests`,
      );
      await sleep(waitTime, "Rate limit cooling down");
    }

    this.requests.push(now);
  }
}

const rateLimiter = new RateLimiter();

setInterval(retryFailedSignatures, RETRY_FAILED_SIGNATURES_INTERVAL);

async function processTransaction(
  connection: Connection,
  signature: string,
  retryCount = 0,
): Promise<boolean> {
  try {
    await rateLimiter.checkLimit();

    const transaction = await connection.getTransaction(signature, {
      commitment: "confirmed",
    });

    if (transaction?.meta?.logMessages) {
      parseEvents({ logs: transaction.meta.logMessages });
      await markSignatureAsProcessed(signature);
      return true;
    } else {
      console.log("No logs found for transaction:", signature);
      return false;
    }
  } catch (error: any) {
    if (error?.toString().includes("429") && retryCount < MAX_RETRIES) {
      const delay = getRetryDelay(retryCount);
      console.log(
        `🔄 Rate limited, attempting retry ${retryCount + 1}/${MAX_RETRIES}`,
      );
      await sleep(delay, `Rate limit retry attempt ${retryCount + 1}`);
      return processTransaction(connection, signature, retryCount + 1);
    }

    console.error(`❌ Error processing transaction ${signature}:`, error);
    return false;
  }
}

async function processTransactionsBatch(
  connection: Connection,
  signatures: Array<{ signature: string }>,
): Promise<{ processed: number; skipped: number }> {
  let processed = 0;
  let skipped = 0;

  const chunkSize = CONCURRENT_REQUESTS;
  const totalChunks = Math.ceil(signatures.length / chunkSize);

  for (let i = 0; i < signatures.length; i += chunkSize) {
    const currentChunk = Math.floor(i / chunkSize) + 1;
    console.log(`🔄 Processing chunk ${currentChunk}/${totalChunks}`);

    const chunk = signatures.slice(i, i + chunkSize);
    const promises = chunk.map(async ({ signature }) => {
      const isProcessed = await isSignatureProcessed(signature);
      if (isProcessed) {
        skipped++;
        return;
      }

      const success = await processTransaction(connection, signature);
      if (success) {
        processed++;
      }
    });

    await Promise.all(promises);

    if (i + chunkSize < signatures.length) {
      await sleep(100, "Inter-chunk cooling period");
    }
  }

  return { processed, skipped };
}

async function fetchSignatures(
  connection: Connection,
  programId: PublicKey,
  options: GetSignaturesForAddressOptions,
  retryCount = 0,
): Promise<{
  signatures: Array<{ signature: string }> | null;
  error?: boolean;
}> {
  try {
    await rateLimiter.checkLimit();

    console.log("🔍 Fetching signatures with options:", {
      before: options.before,
      until: options.until,
      limit: options.limit,
    });

    const signatures = await connection.getSignaturesForAddress(
      programId,
      options,
    );

    console.log(`✅ Fetched ${signatures.length} signatures`);
    if (signatures.length > 0) {
      console.log("📌 First signature:", signatures[0].signature);
      console.log(
        "📌 Last signature:",
        signatures[signatures.length - 1].signature,
      );
    }

    return { signatures };
  } catch (error: any) {
    if (error?.toString().includes("429") && retryCount < MAX_RETRIES) {
      const delay = getRetryDelay(retryCount);
      console.log(
        `⚠️ Rate limited while fetching signatures, retry ${retryCount + 1}/${MAX_RETRIES}`,
      );
      await sleep(delay, `Signature fetch retry attempt ${retryCount + 1}`);
      return fetchSignatures(connection, programId, options, retryCount + 1);
    }

    console.error("❌ Error fetching signatures:", error);
    return { signatures: null, error: true };
  }
}

async function indexProgramTransactions({
  lastSignature,
  connection,
  programId,
  configFilePath,
}: IndexVoteTxnOptions) {
  try {
    let hasMore = true;
    let totalProcessed = 0;
    let totalSkipped = 0;
    let beforeSignature: string | undefined = undefined;

    console.log("🚀 Starting indexing process");
    console.log("📝 Last processed signature:", lastSignature);

    while (hasMore) {
      const options: GetSignaturesForAddressOptions = {
        limit: BATCH_SIZE,
      };

      if (lastSignature) {
        options.until = lastSignature;
      }

      if (beforeSignature) {
        options.before = beforeSignature;
      }

      const { signatures, error } = await fetchSignatures(
        connection,
        programId,
        options,
      );

      if (error) {
        console.log(
          "⚠️ Encountered error fetching signatures, will retry in next iteration",
        );
        break;
      }

      if (signatures && signatures.length > 0) {
        console.log(`📦 Processing batch of ${signatures.length} signatures`);

        const { processed, skipped } = await processTransactionsBatch(
          connection,
          signatures,
        );

        totalProcessed += processed;
        totalSkipped += skipped;

        console.log(
          `📊 Batch summary: Processed ${processed}, Already processed ${skipped}`,
        );
        console.log(
          `📈 Running total: Processed ${totalProcessed}, Skipped ${totalSkipped}`,
        );

        if (signatures.length === BATCH_SIZE) {
          beforeSignature = signatures[signatures.length - 1].signature;
          writeLastProcessedSignatureToConfig(configFilePath, beforeSignature);
          console.log(
            `🔖 Setting before signature for next batch: ${beforeSignature}`,
          );
        } else {
          hasMore = false;
          console.log(
            "✅ Reached end of signatures (batch smaller than limit)",
          );
        }
      } else {
        hasMore = false;
        console.log("✅ No more signatures found");
      }
    }

    console.log("🎉 Indexing complete");
    console.log(
      `📊 Final summary: Total processed ${totalProcessed}, Total skipped ${totalSkipped}`,
    );
  } catch (error) {
    console.error("❌ Error in indexProgramTransactions:", error);
  }
}

export default indexProgramTransactions;
