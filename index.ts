import { Connection, PublicKey } from "@solana/web3.js";
import { WebSocket } from "ws";
import { BorshCoder, EventParser, type Idl } from "@project-serum/anchor";
import idl from "./idl.json";
import fs from "fs";
import path from "path";
import parseEvents from "./src/eventparser";
import { PROGRAM_ID, SOLANA_RPC_URL } from "./src/constants";
import "./server";
import initializeDatabase from "./src/db/init";
import indexProgramTransactions from "./src/indexVoteTxns";
const CONFIG_FILE_PATH = path.resolve(__dirname, "config.json");

const connection = new Connection(SOLANA_RPC_URL);
const programId = new PublicKey(PROGRAM_ID);
const eventParser = new EventParser(programId, new BorshCoder(idl as Idl));

let lastSignature: string | undefined;

if (fs.existsSync(CONFIG_FILE_PATH)) {
  const config = JSON.parse(fs.readFileSync(CONFIG_FILE_PATH, "utf8"));
  lastSignature = config.lastSignature;
}

async function main() {
  try {
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
