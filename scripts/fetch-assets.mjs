#!/usr/bin/env node
// Downloads CC0 PBR texture sets from ambientCG and writes resized JPGs to public/textures.
// Idempotent: a set is skipped when its color map already exists. Pass --force to refetch.
//
// Usage: node scripts/fetch-assets.mjs [--force]

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";

const ROOT = new URL("..", import.meta.url).pathname;
const OUT = join(ROOT, "public/textures");
const force = process.argv.includes("--force");

/** ambientCG asset id -> local name, output size, maps to keep. */
const SETS = [
  { id: "Asphalt010", name: "asphalt", size: 1024, maps: ["Color", "NormalGL", "Roughness"] },
  { id: "Ground037", name: "ground", size: 1024, maps: ["Color", "NormalGL", "Roughness"] },
  { id: "Grass004", name: "grass", size: 1024, maps: ["Color", "NormalGL", "Roughness"] },
  { id: "Concrete034", name: "concrete", size: 1024, maps: ["Color", "NormalGL", "Roughness"] },
  { id: "Rubber004", name: "rubber", size: 512, maps: ["Color", "NormalGL", "Roughness"] },
  { id: "MetalPlates006", name: "metal", size: 512, maps: ["Color", "NormalGL", "Roughness", "Metalness"] },
];

const SUFFIX = { Color: "color", NormalGL: "normal", Roughness: "rough", Metalness: "metal" };

async function fetchSet(set) {
  const colorPath = join(OUT, `${set.name}-color.jpg`);
  if (!force && existsSync(colorPath)) {
    console.log(`${set.name}: present`);
    return;
  }
  const url = `https://ambientcg.com/get?file=${set.id}_1K-JPG.zip`;
  const response = await fetch(url, { headers: { "User-Agent": "hold-the-lane-asset-fetch" } });
  if (!response.ok) throw new Error(`${set.id}: HTTP ${response.status}`);
  const tmp = mkdtempSync(join(tmpdir(), `acg-${set.name}-`));
  try {
    const zip = join(tmp, "set.zip");
    writeFileSync(zip, Buffer.from(await response.arrayBuffer()));
    execFileSync("unzip", ["-q", "-o", zip, "-d", tmp]);
    const files = readdirSync(tmp);
    for (const map of set.maps) {
      const file = files.find((entry) => entry.endsWith(`_${map}.jpg`) || entry.endsWith(`_${map}.png`));
      if (!file) {
        console.warn(`  ${set.id}: no ${map} map`);
        continue;
      }
      const target = join(OUT, `${set.name}-${SUFFIX[map]}.jpg`);
      await sharp(join(tmp, file)).resize(set.size, set.size).jpeg({ quality: map === "Color" ? 86 : 80 }).toFile(target);
    }
    console.log(`${set.name}: ok (${set.id})`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

mkdirSync(OUT, { recursive: true });
for (const set of SETS) await fetchSet(set);
