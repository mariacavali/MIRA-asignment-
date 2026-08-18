import mysql from "mysql2/promise";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is not available");
}

const connection = await mysql.createConnection(databaseUrl);

try {
  const [journeyRows] = await connection.execute(
    "SELECT id, status, currentStep, turnCount, startedAt, completedAt FROM mira_v3_journeys WHERE id = ?",
    [60001],
  );
  const [messageRows] = await connection.execute(
    "SELECT ordinal, role, content, provenance, createdAt FROM mira_v3_messages WHERE journeyId = ? ORDER BY ordinal ASC",
    [60001],
  );

  const outputDir = resolve("evidence/journey-60001/raw");
  await mkdir(outputDir, { recursive: true });
  await writeFile(
    resolve(outputDir, "journey-60001-authoritative-messages.json"),
    JSON.stringify({ journey: journeyRows[0] ?? null, messages: messageRows }, null, 2),
    "utf8",
  );

  const transcript = await readFile(
    resolve("evidence/journey-60001/mira-v3-session-60001-transcript.md"),
    "utf8",
  );
  const conversation = transcript
    .split("## Adaptive Conversation\n")[1]
    ?.split("## Confirmed Mirror\n")[0];
  const quotedMessages = conversation
    ?.split("\n")
    .filter((line) => line.startsWith("> "))
    .map((line) => line.slice(2));
  const authoritativeMessages = messageRows.map((row) => row.content);

  if (JSON.stringify(quotedMessages) !== JSON.stringify(authoritativeMessages)) {
    throw new Error("Transcript Markdown does not exactly match the authoritative message order");
  }

  console.log(
    `Exported and exactly validated ${messageRows.length} ordered messages for journey 60001.`,
  );
} finally {
  await connection.end();
}
