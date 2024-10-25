import { Connection, PublicKey } from "@solana/web3.js";
import { WebSocket } from "ws";
import { BorshCoder, EventParser, type Idl } from "@project-serum/anchor";
import idl from "./idl.json";
import fs from "fs";
import path from "path";
import parseEvents from "./src/eventparser";

const SOLANA_RPC_URL = "http://127.0.0.1:8899";
const CONFIG_FILE_PATH = path.resolve(__dirname, "config.json");

const connection = new Connection(SOLANA_RPC_URL);
const programId = new PublicKey("BUjBdCdFmNDrBn6Sg2SB4dd6H8StsFZ7U4JqvzEAYHgh");
const eventParser = new EventParser(programId, new BorshCoder(idl as Idl));

let lastSignature: string | undefined;

if (fs.existsSync(CONFIG_FILE_PATH)) {
  const config = JSON.parse(fs.readFileSync(CONFIG_FILE_PATH, "utf8"));
  lastSignature = config.lastSignature;
}

const processedSignatures = new Set<string>();

async function fetchTransactions() {
  try {
    const voteAccountAddress = programId;

    let hasMore = true;

    while (hasMore) {
      const signatures = await connection.getSignaturesForAddress(
        voteAccountAddress,
        {
          until: lastSignature ?? undefined,
        },
      );

      if (signatures.length > 0) {
        for (let { signature } of signatures) {
          if (processedSignatures.has(signature)) {
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
          processedSignatures.add(signature);
        }
        lastSignature = signatures[signatures.length - 1].signature;

        fs.writeFileSync(
          CONFIG_FILE_PATH,
          JSON.stringify({ lastSignature }, null, 2),
          "utf8",
        );
      } else {
        hasMore = false;
        console.log("No more signatures found.");
      }
    }
  } catch (error) {
    console.error("Error fetching transactions:", error);
  }
}

setInterval(fetchTransactions, 30000);
fetchTransactions();
