import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { acceptableDailyDay, denverDay } from "@/game/daily";
import { destinationById } from "@/game/content";
import { claimDecision, nameKey, normalizeName, validateName } from "@/game/names";
import { isPlausibleScore } from "@/game/score";
import type { Bucket, FormatId } from "@/game/types";

export type ScoreRow = {
  name: string;
  score: number;
  hearts: number;
  chain: number;
  at: number;
};

type Board = {
  claims: Record<string, string>;
  rows: Record<string, ScoreRow>;
};

export type PostInput = {
  gamertag: string;
  secret?: string;
  destination: string;
  format: FormatId;
  bucket: Bucket;
  day: string;
  score: number;
  hearts: number;
  chain: number;
};

export type BoardResult =
  | { ok: true; secret: string | null; rank: number; rows: ScoreRow[]; shared: boolean }
  | { ok: false; status: number; error: string };

const EMPTY: Board = { claims: {}, rows: {} };
let chain: Promise<unknown> = Promise.resolve();

export async function postScore(input: PostInput): Promise<BoardResult> {
  const nameError = validateName(input.gamertag);
  if (nameError) return { ok: false, status: 400, error: nameError };
  if (!isPlausibleScore(input.score)) return { ok: false, status: 400, error: "That score does not fit on the board." };
  if (input.format !== "push" && input.format !== "gauntlet") return { ok: false, status: 400, error: "Unknown round." };
  if (input.bucket !== "free" && input.bucket !== "daily") return { ok: false, status: 400, error: "Unknown board." };
  try {
    destinationById(input.destination);
  } catch {
    return { ok: false, status: 400, error: "Unknown stop." };
  }
  const day = input.bucket === "daily" ? input.day : "all";
  if (input.bucket === "daily" && !acceptableDailyDay(input.day)) {
    return { ok: false, status: 400, error: "That daily has already left the station." };
  }
  if (!(await storageReady())) {
    return { ok: false, status: 503, error: "Scores stay on this phone until a shared board is connected." };
  }

  return enqueue(async () => {
    const board = await readBoard();
    const key = nameKey(input.gamertag);
    const decision = claimDecision(board.claims[key] ?? null, input.secret ?? null, hashSecret);
    if (decision === "taken") {
      return { ok: false as const, status: 409, error: "That name is already on another phone." };
    }
    let secret: string | null = null;
    if (decision === "create") {
      secret = randomBytes(24).toString("hex");
      board.claims[key] = hashSecret(secret);
    }
    const rowId = [input.bucket, day, input.destination, input.format, key].join(":");
    const previous = board.rows[rowId];
    if (!previous || input.score > previous.score) {
      board.rows[rowId] = {
        name: normalizeName(input.gamertag),
        score: Math.floor(input.score),
        hearts: input.hearts,
        chain: input.chain,
        at: Date.now(),
      };
    }
    await writeBoard(board);
    const rows = rowsFor(board, input.bucket, day, input.destination, input.format);
    const rank = rows.findIndex((row) => nameKey(row.name) === key) + 1;
    return { ok: true as const, secret, rank, rows: rows.slice(0, 20), shared: true };
  });
}

export async function readScores(bucket: Bucket, destination: string, format: FormatId, day = denverDay()): Promise<ScoreRow[]> {
  if (!(await storageReady())) return [];
  const board = await readBoard();
  return rowsFor(board, bucket, bucket === "daily" ? day : "all", destination, format).slice(0, 20);
}

function rowsFor(board: Board, bucket: Bucket, day: string, destination: string, format: FormatId): ScoreRow[] {
  const prefix = `${bucket}:${day}:${destination}:${format}:`;
  return Object.entries(board.rows)
    .filter(([id]) => id.startsWith(prefix))
    .map(([, row]) => row)
    .sort((a, b) => b.score - a.score || a.at - b.at);
}

function hashSecret(secret: string) {
  return createHash("sha256").update(secret).digest("hex");
}

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = chain.then(task, task);
  chain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function storageReady() {
  if (redisConfigured()) return true;
  return !process.env.VERCEL;
}

function redisConfigured() {
  return Boolean(
    (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) ||
      (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN),
  );
}

async function readBoard(): Promise<Board> {
  if (redisConfigured()) {
    const raw = await redis(["GET", "hold-the-lane:board"]);
    if (typeof raw !== "string" || raw.length === 0) return structuredClone(EMPTY);
    return { ...structuredClone(EMPTY), ...JSON.parse(raw) } as Board;
  }
  try {
    const raw = await readFile(filePath(), "utf8");
    return { ...structuredClone(EMPTY), ...JSON.parse(raw) } as Board;
  } catch {
    return structuredClone(EMPTY);
  }
}

async function writeBoard(board: Board) {
  const payload = JSON.stringify(board);
  if (redisConfigured()) {
    await redis(["SET", "hold-the-lane:board", payload]);
    return;
  }
  const file = filePath();
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp`;
  await writeFile(temporary, payload);
  await rename(temporary, file);
}

async function redis(command: (string | number)[]) {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) throw new Error("Redis is not configured.");
  const response = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(command),
  });
  if (!response.ok) throw new Error("The shared board did not answer.");
  const payload = (await response.json()) as { result?: unknown };
  return payload.result;
}

function filePath() {
  return path.join(process.cwd(), ".data", "board.json");
}
