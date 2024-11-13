import { google } from "googleapis";
import express, { type Request, type Response } from "express";
import { getLeaderboard, getLeaderboardKey } from "./src/leaderboard";
import "./src/redis/index";
import getFormResponses from "./src/google/getFormResponses";
import cors from "cors";

const app = express();
app.use(express.json());

app.use(cors());

app.get("/api/form-responses", async (_req: Request, res: Response) => {
  try {
    const responses = await getFormResponses();
    res.json(responses);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch form responses" });
  }
});

app.get("/leaderboard", async (req: Request, res: Response) => {
  try {
    const lb = await getLeaderboard("0");
    res.status(200).json(lb);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch form responses" });
  }
});

const PORT: number = parseInt(process.env.PORT || "3001", 10);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
