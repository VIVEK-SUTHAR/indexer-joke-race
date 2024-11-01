import type { Connection, PublicKey } from "@solana/web3.js";
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
const RETRY_FAILED_SIGNATURES_INTERVAL = 300000;

setInterval(retryFailedSignatures, RETRY_FAILED_SIGNATURES_INTERVAL);

async function indexProgramTransactions({
  lastSignature,
  connection,
  programId,
  configFilePath,
}: IndexVoteTxnOptions) {
  try {
    let hasMore = true;
    while (hasMore) {
      const signatures = await connection.getSignaturesForAddress(programId, {
        until: lastSignature ?? undefined,
      });

      if (signatures && signatures.length > 0) {
        for (let { signature } of signatures) {
          const isProcessed = await isSignatureProcessed(signature);
          if (isProcessed) {
            continue;
          }
          const transaction = await connection.getTransaction(signature, {
            commitment: "confirmed",
          });
          if (transaction?.meta?.logMessages) {
            parseEvents({ logs: transaction.meta.logMessages });
          } else {
            console.log("No logs found for transaction:", signature);
          }
          await markSignatureAsProcessed(signature);
        }
        lastSignature = signatures[signatures.length - 1].signature;
        writeLastProcessedSignatureToConfig(configFilePath, lastSignature);
      } else {
        hasMore = false;
        console.log("No more signatures found.");
      }
    }
  } catch (error) {
    console.error("Error fetching transactions:", error);
  }
}
export default indexProgramTransactions;
