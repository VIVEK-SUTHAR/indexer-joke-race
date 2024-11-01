import client from "./redis";
import { contestantMap } from "./utils";

type LeaderboardEntry = {
  rank: number;
  contestantId: string;
  votes: number;
  percentageOfTotal: number;
};

type LeaderboardResponse = {
  entries: LeaderboardEntry[];
  totalVotes: number;
  totalContestants: number;
  contestId: string;
  lastUpdated: number;
};

const CONTEST_LEADERBOARD_PREFIX = "contest_leaderboard:";
const CONTESTANT_VOTES_PREFIX = "contestant_votes:";

export const getLeaderboardKey = (contestId: string) =>
  `${CONTEST_LEADERBOARD_PREFIX}${contestId}`;

export const getContestantVotesKey = (
  contestId: string,
  contestantId: string,
) => `${CONTESTANT_VOTES_PREFIX}${contestId}:${contestantId}`;

interface Contestant {
  onChainId: string;
}
export async function initializeLeaderboard(
  contestId: string,
  contestants: Contestant[],
) {
  try {
    const leaderboardKey = getLeaderboardKey(contestId);

    for (const contestant of contestants) {
      client.zAdd(leaderboardKey, {
        score: 0,
        value: contestant.onChainId.toString(),
      });
    }

    console.log(
      `Initialized leaderboard for contest ${contestId} with ${contestants.length} contestants`,
    );
    return true;
  } catch (error) {
    console.error("Error initializing leaderboard:", error);
    throw new Error("Failed to initialize leaderboard");
  }
}
async function getContestantStats(contestId: string, contestantId: string) {
  try {
    const [rank, score] = await Promise.all([
      client.zRevRank(getLeaderboardKey(contestId), contestantId),
      client.zScore(getLeaderboardKey(contestId), contestantId),
    ]);

    return {
      rank: rank !== null ? rank + 1 : null,
      votes: score || 0,
    };
  } catch (error) {
    console.error("Error fetching contestant stats:", error);
    return { rank: null, votes: 0 };
  }
}

async function getContestantVoteHistory(
  contestId: string,
  contestantId: string,
) {
  try {
    const votes = await client.hGetAll(
      getContestantVotesKey(contestId, contestantId),
    );

    return Object.entries(votes).map(([timestamp, voteData]) => ({
      timestamp,
      ...JSON.parse(voteData),
    }));
  } catch (error) {
    console.error("Error fetching vote history:", error);
    return [];
  }
}

export { getContestantStats, getContestantVoteHistory };

async function getLeaderboard(
  contestId: string,
  options: {
    page?: number;
    limit?: number;
  } = {},
): Promise<LeaderboardResponse> {
  const { page = 1, limit = 1000 } = options;

  try {
    const leaderboardKey = getLeaderboardKey(contestId);
    const start = (page - 1) * limit;
    const end = start + limit - 1;

    const allContestants = Array.from(contestantMap.entries()).map(
      ([id, data]) => ({
        contestantId: id.toString(),
        contestantData: data,
        votes: 0,
        rank: null, // default rank, to be assigned
      }),
    );

    // Fetch contestants with votes from Redis
    const [totalContestants, totalVotesArray, leaderboardEntries] =
      await Promise.all([
        client.zCard(leaderboardKey),
        client.zRangeWithScores(leaderboardKey, 0, -1),
        client.zRangeWithScores(leaderboardKey, start, end, { REV: true }),
      ]);

    const totalVotes = totalVotesArray.reduce(
      (sum, entry) => sum + entry.score,
      0,
    );

    // Map votes and ranks from Redis entries
    leaderboardEntries.forEach((entry, index) => {
      const contestant = allContestants.find(
        (c) => c.contestantId === entry.value,
      );
      if (contestant) {
        contestant.votes = entry.score;
        contestant.rank = start + index + 1;
      }
    });

    // Sort by rank, pushing zero-vote contestants to the bottom
    allContestants.sort(
      (a, b) =>
        (a.rank !== null ? a.rank : Infinity) -
        (b.rank !== null ? b.rank : Infinity),
    );

    // Compute percentage of total votes
    const entries = allContestants.map((contestant) => ({
      ...contestant,
      percentageOfTotal:
        totalVotes > 0
          ? Number(((contestant.votes / totalVotes) * 100).toFixed(2))
          : 0,
    }));

    return {
      entries,
      totalVotes,
      totalContestants: allContestants.length,
      contestId,
      lastUpdated: Date.now(),
    };
  } catch (error) {
    console.error("Error fetching leaderboard:", error);
    throw new Error("Failed to fetch leaderboard");
  }
}

async function getContestantVoteCount(
  contestId: string,
  contestantId: string,
): Promise<number> {
  const score = await client.zScore(getLeaderboardKey(contestId), contestantId);
  return score || 0;
}

export {
  getLeaderboard,
  getContestantVoteCount,
  type LeaderboardEntry,
  type LeaderboardResponse,
};
