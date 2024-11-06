import { Connection, PublicKey } from "@solana/web3.js";
import idl from "./idl.json";
import fs from "fs";
import path from "path";
import parseEvents from "./src/eventparser";
import { PROGRAM_ID, SOLANA_RPC_URL } from "./src/constants";
import initializeDatabase from "./src/db/init";
import indexProgramTransactions from "./src/indexVoteTxns";
import clearAndResetDatabase from "./src/db/reset";
import client from "./src/redis";
import { execSync } from "child_process";

const CONFIG_FILE_PATH = path.resolve(__dirname, "config.json");
const connection = new Connection(SOLANA_RPC_URL);
const programId = new PublicKey(PROGRAM_ID);
let lastSignature: string | undefined;

if (fs.existsSync(CONFIG_FILE_PATH)) {
  const config = JSON.parse(fs.readFileSync(CONFIG_FILE_PATH, "utf8"));
  lastSignature = config.lastSignature;
}

async function processArgs() {
  process.argv.forEach(async function (val, index, array) {
    if (val === "--clean") {
      console.log("Found clean option, Cleaning up DB and Redis");
      console.log("Resetting DB...");
      await clearAndResetDatabase();
      console.log("DB Reset!");
      console.log("REDIS Cleaning...");
      await client.flushAll();
      console.log("REDIS Cleaned!");
      if (fs.existsSync(CONFIG_FILE_PATH)) {
        execSync(`rm ${process.cwd()}/config.json`);
      }
    }
  });
}

async function startServer() {
  await import("./server");
}

async function main() {
  try {
    await startServer();
    await processArgs();

    await initializeDatabase();

    const options = {
      lastSignature: lastSignature,
      programId: PROGRAM_ID,
      connection: connection,
      configFilePath: CONFIG_FILE_PATH,
    };

    setInterval(() => {
      indexProgramTransactions(options);
    }, 15000);

    await indexProgramTransactions(options);
  } catch (error) {
    console.log(error);
  }
}

main();
