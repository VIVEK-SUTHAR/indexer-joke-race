import { google } from "googleapis";
import express, { type Request, type Response } from "express";

interface FormResponse {
  timestamp: string;
  email_address: string;
  name: string;
  team_name: string;
  product_name: string;
  product_description: string;
  category: string;
  team_logo_image: string;
  speacker_headshot: string;
  eclipse_wallet_address: string;
  [key: string]: string;
}

interface ErrorResponse {
  error: string;
}

const app = express();

if (
  !process.env.GOOGLE_CLIENT_EMAIL ||
  !process.env.GOOGLE_PRIVATE_KEY ||
  !process.env.SPREADSHEET_ID
) {
  throw new Error("Required environment variables are not set");
}

const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_CLIENT_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
  },
  scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
});

function cleanKey(key: string): string {
  return key
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

const sheets = google.sheets({ version: "v4", auth });

async function getFormResponses(): Promise<FormResponse[] | ErrorResponse> {
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: "Form Responses 1",
    });

    const rows = response.data.values;
    if (!rows || rows.length === 0) {
      return { error: "No data found." };
    }

    const headers = rows[0].map((header: string) => cleanKey(header));

    const data = rows.slice(1).map((row: string[]) => {
      const formResponse: { [key: string]: string } = {};
      row.forEach((value: string, index: number) => {
        formResponse[headers[index]] = value;
      });
      return formResponse as FormResponse;
    });

    return data;
  } catch (error) {
    console.error("Error fetching form responses:", error);
    throw error;
  }
}

app.get("/api/form-responses", async (_req: Request, res: Response) => {
  try {
    const responses = await getFormResponses();
    res.json(responses);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch form responses" });
  }
});

const PORT: number = parseInt(process.env.PORT || "3000", 10);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

export { app, getFormResponses, cleanKey };
