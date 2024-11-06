import { Connection, PublicKey } from "@solana/web3.js";
import { BorshCoder, EventParser, type Idl, BN } from "@project-serum/anchor";
import idl from "../idl.json";
import fs from "fs";
import path, { extname } from "path";
import { PROGRAM_ID } from "./constants";
import client from "./redis";
import { getContestantVotesKey, getLeaderboardKey } from "./leaderboard";

const programId = new PublicKey(PROGRAM_ID);
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
    const contestId = data.contestId.toString();
    const contestantId = data.contestantId.toString();
    console.log("Vote Txn");
    console.count(data.contestantId);
    await client.zIncrBy(getLeaderboardKey(contestId), 1, contestantId);

    await client.hSet(
      getContestantVotesKey(contestId, contestantId),
      data.castedAt.toString(),
      JSON.stringify({
        votedBy: data.votedBy.toString(),
        timestamp: data.castedAt.toString(),
      }),
    );
  } catch (error) {
    console.log(error);
  }
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
    console.log("Contest ID", data.contestId.toString());
    console.log("Created By", data.createdBy.toString());
    console.log("Created At", data.createdAt.toString());
    console.log("MetadataUri", data.metadataUri);
  } catch (error) {
    console.log(error, "");
  }
}
