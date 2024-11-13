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

const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY = 1000;
const MAX_RETRY_DELAY = 10000;
const RETRY_FAILED_SIGNATURES_INTERVAL = 300000;
const BATCH_SIZE = 100;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const getRetryDelay = (attempt: number) => {
  return Math.min(INITIAL_RETRY_DELAY * Math.pow(2, attempt), MAX_RETRY_DELAY);
};

setInterval(retryFailedSignatures, RETRY_FAILED_SIGNATURES_INTERVAL);

async function processTransaction(
  connection: Connection,
  signature: string,
  retryCount = 0,
): Promise<boolean> {
  try {
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
      console.log(`Rate limited, retrying after ${delay}ms...`);
      await sleep(delay);
      return processTransaction(connection, signature, retryCount + 1);
    }

    console.error(`Error processing transaction ${signature}:`, error);
    return false;
  }
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
    console.log("Fetching signatures with options:", {
      before: options.before,
      until: options.until,
      limit: options.limit,
    });

    const signatures = await connection.getSignaturesForAddress(
      programId,
      options,
    );

    console.log(`Fetched ${signatures.length} signatures`);
    if (signatures.length > 0) {
      console.log("First signature:", signatures[0].signature);
      console.log(
        "Last signature:",
        signatures[signatures.length - 1].signature,
      );
    }

    return { signatures };
  } catch (error: any) {
    if (error?.toString().includes("429") && retryCount < MAX_RETRIES) {
      const delay = getRetryDelay(retryCount);
      console.log(
        `Rate limited while fetching signatures, retrying after ${delay}ms...`,
      );
      await sleep(delay);
      return fetchSignatures(connection, programId, options, retryCount + 1);
    }

    console.error("Error fetching signatures:", error);
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

    console.log("Starting indexing process");
    console.log("Last processed signature:", lastSignature);

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
          "Encountered error fetching signatures, will retry in next iteration",
        );
        break;
      }

      if (signatures && signatures.length > 0) {
        console.log(`Processing batch of ${signatures.length} signatures`);
        let batchProcessed = 0;
        let batchSkipped = 0;

        for (let { signature } of signatures) {
          console.log(`Processing signature: ${signature}`);

          const isProcessed = await isSignatureProcessed(signature);
          if (isProcessed) {
            console.log(`Signature ${signature} already processed`);
            batchSkipped++;
            writeLastProcessedSignatureToConfig(configFilePath, signature);
            continue;
          }

          const success = await processTransaction(connection, signature);
          if (success) {
            console.log(`Successfully processed signature: ${signature}`);
            batchProcessed++;
            writeLastProcessedSignatureToConfig(configFilePath, signature);
          } else {
            console.log(
              `Failed to process signature ${signature}, will retry in next run`,
            );
            hasMore = false;
            break;
          }
        }

        totalProcessed += batchProcessed;
        totalSkipped += batchSkipped;

        console.log(
          `Batch summary: Processed ${batchProcessed}, Already processed ${batchSkipped}`,
        );
        console.log(
          `Running total: Processed ${totalProcessed}, Skipped ${totalSkipped}`,
        );

        if (signatures.length === BATCH_SIZE) {
          beforeSignature = signatures[signatures.length - 1].signature;
          console.log(
            `Setting before signature for next batch: ${beforeSignature}`,
          );
        } else {
          hasMore = false;
          console.log("Reached end of signatures (batch smaller than limit)");
        }
      } else {
        hasMore = false;
        console.log("No more signatures found");
      }
    }

    console.log("Indexing complete");
    console.log(
      `Final summary: Total processed ${totalProcessed}, Total skipped ${totalSkipped}`,
    );
  } catch (error) {
    console.error("Error in indexProgramTransactions:", error);
  }
}

export default indexProgramTransactions;
