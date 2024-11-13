import fs from "fs";
import { initializeLeaderboard } from "./leaderboard";

export function writeLastProcessedSignatureToConfig(
  path: string,
  lastSignature: string,
) {
  fs.writeFileSync(path, JSON.stringify({ lastSignature }, null, 2), "utf8");
}

const contestantMap = new Map<number, any>();

export async function getAllContestants() {
  try {
    const res = await fetch(
      "https://solana-app-day.vercel.app/api/contestant?limit=500",
    );
    const { data } = await res.json();
    await initializeLeaderboard("1", data);
    data.forEach((contestant: any) => {
      contestantMap.set(contestant.onChainId, contestant);
    });
    console.log("Contestant Map Init");
  } catch (error) {
    console.error("Error fetching contestants:", error);
  }
}

getAllContestants();

export { contestantMap };
