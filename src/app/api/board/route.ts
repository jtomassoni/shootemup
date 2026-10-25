import { denverDay } from "@/game/daily";
import type { Bucket, FormatId } from "@/game/types";
import { postScore, readScores } from "@/server/board";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const destination = url.searchParams.get("destination") || "colorado";
  const format = (url.searchParams.get("format") || "push") as FormatId;
  const bucket = (url.searchParams.get("bucket") || "free") as Bucket;
  const day = url.searchParams.get("day") || denverDay();
  try {
    const rows = await readScores(bucket, destination, format, day);
    return Response.json({ rows, shared: true });
  } catch {
    return Response.json({ rows: [], shared: false });
  }
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "The score never arrived." }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return Response.json({ error: "The score never arrived." }, { status: 400 });
  }
  const input = body as Record<string, unknown>;
  const result = await postScore({
    gamertag: String(input.gamertag ?? ""),
    secret: typeof input.secret === "string" ? input.secret : undefined,
    destination: String(input.destination ?? ""),
    format: input.format === "gauntlet" ? "gauntlet" : "push",
    bucket: input.bucket === "daily" ? "daily" : "free",
    day: String(input.day ?? ""),
    score: Number(input.score),
    hearts: Number(input.hearts ?? 0),
    chain: Number(input.chain ?? 0),
  });
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
  return Response.json(result);
}
