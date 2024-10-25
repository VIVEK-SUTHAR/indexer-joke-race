import { Connection, PublicKey } from "@solana/web3.js";
import { BorshCoder, EventParser, type Idl, BN } from "@project-serum/anchor";
import idl from "../idl.json";
import fs from "fs";
import path, { extname } from "path";

const programId = new PublicKey("BUjBdCdFmNDrBn6Sg2SB4dd6H8StsFZ7U4JqvzEAYHgh");
const eventParser = new EventParser(programId, new BorshCoder(idl as Idl));

export type ParseEventOptions = {
  logs: string[];
};

export default async function parseEvents({ logs }: ParseEventOptions) {
  const events = eventParser.parseLogs(logs);
  for (let event of events) {
    switch (event.name) {
      case "ContestCreated":
        handleContestCreated(event.data as EventContestCreated);
        break;
      case "VoteCasted":
        handleVoteCasted(event.data as EventVoteCasted);
        break;
    }
  }
}

type EventVoteCasted = {
  votedBy: PublicKey;
  contestId: BN;
  castedAt: BN;
  contestantId: BN;
};

async function handleVoteCasted(data: EventVoteCasted) {
  try {
    console.log("Voted By ", data.votedBy.toString());
    console.log("Voted AT ", data.castedAt.toString());
    console.log("Contest ID ", data.contestId.toString());
    //TO-do
    //Prepare DB Statements and Update Recored on Parsed Event
  } catch (error) {}
}
type EventContestCreated = {
  contestId: BN;
  createdBy: PublicKey;
  metadataUri: string;
  createdAt: BN;
  startTime: BN;
  endTime: BN;
};

async function handleContestCreated(data: EventContestCreated) {
  try {
    console.log(data);
    console.log("Contest ID", data.contestId.toString());
    console.log("Created By", data.createdBy.toString());
    console.log("Created At", data.createdAt.toString());
    console.log("MetadataUri", data.metadataUri);
    //TO-do
    //Prepare DB Statements and Update Recored on Parsed Event
  } catch (error) {}
}
