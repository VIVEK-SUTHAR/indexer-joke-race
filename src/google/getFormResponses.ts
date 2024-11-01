import { google } from "googleapis";
import { auth } from ".";
import type { ErrorResponse, FormResponse } from "../types";
import { cleanKey } from "./utils";

export default async function getFormResponses(): Promise<
  FormResponse[] | ErrorResponse
> {
  try {
    const sheets = google.sheets({ version: "v4", auth });
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
