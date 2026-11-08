#!/usr/bin/env node
// Converts the raw Mixamo downloads in assets-src/mixamo into game-ready GLBs.
//
//   assets-src/mixamo/<Character>/<Character>.fbx        skin (mesh + rig)
//   assets-src/mixamo/<Character>/<Pack>/<clip>.fbx      animation-only clips
//
// For every character listed in CHARACTERS this writes:
//   public/models/characters/<slug>.glb         skin + the selected clips, 1k webp textures
//   public/models/characters/<slug>.horde.glb   decimated skin + locomotion clips only, 512 textures
//
// Usage: node scripts/convert-mixamo.mjs [slug ...]

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import {
  dedup,
  inspect,
  mergeDocuments,
  prune,
  quantize,
  resample,
  simplify,
  textureCompress,
  unpartition,
  weld,
} from "@gltf-transform/functions";
import { MeshoptSimplifier } from "meshoptimizer";
import sharp from "sharp";

const ROOT = new URL("..", import.meta.url).pathname;
const SRC = join(ROOT, "assets-src/mixamo");
const OUT = join(ROOT, "public/models/characters");
const FBX2GLTF = join(ROOT, "node_modules/fbx2gltf/bin", process.platform === "darwin" ? "Darwin" : process.platform === "win32" ? "Windows_NT" : "Linux", process.platform === "win32" ? "FBX2glTF.exe" : "FBX2glTF");

/** Clip name in the game -> candidate file stems (lowercase, no extension) in the pack folders. */
const ZOMBIE_CLIPS = {
  walk: ["zombie walk"],
  run: ["zombie run", "zombie running"],
  crawl: ["zombie crawl"],
  "crawl-run": ["running crawl"],
  idle: ["zombie idle"],
  attack: ["zombie attack"],
  scream: ["zombie scream"],
  hit: ["zombie reaction hit"],
  stumble: ["zombie stumbling"],
  death: ["zombie death"],
  dying: ["zombie dying"],
};

const SOLDIER_CLIPS = {
  aim: ["idle aiming", "rifle aiming idle"],
  fire: ["firing rifle"],
  idle: ["idle"],
  walk: ["walk forward"],
  run: ["run forward"],
  sprint: ["sprint forward"],
  death: ["death from the front"],
  "death-back": ["death from the back"],
};

/** Clips whose horizontal root motion must be stripped so the body stays on its spot. */
const IN_PLACE = new Set(["walk", "run", "crawl", "crawl-run", "sprint", "stumble", "hit", "attack", "scream", "idle", "aim", "fire"]);

const CHARACTERS = [
  { dir: "Cop Zombie L Actisdato", slug: "zombie-cop", clips: ZOMBIE_CLIPS, horde: ["walk", "crawl-run"] },
  { dir: "Warzombie F Pedroso", slug: "zombie-war", clips: ZOMBIE_CLIPS, horde: ["walk", "crawl-run"] },
  { dir: "Parasite L Starkie", slug: "zombie-parasite", clips: ZOMBIE_CLIPS, horde: ["walk", "crawl-run"] },
  { dir: "Swat", slug: "soldier-swat", clips: SOLDIER_CLIPS, horde: null },
  { dir: "Vanguard By T. Choonyung", slug: "soldier-vanguard", clips: SOLDIER_CLIPS, horde: null },
  { dir: "Maw J Laygo", slug: "soldier-maw", clips: SOLDIER_CLIPS, horde: null },
];

const HORDE_TRIS = 3000;

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const only = new Set(process.argv.slice(2));

function listFbx(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...listFbx(full));
    else if (entry.toLowerCase().endsWith(".fbx")) out.push(full);
  }
  return out;
}

function stem(file) {
  return basename(file).replace(/\.fbx$/i, "").toLowerCase().trim();
}

function fbxToGlb(fbx, tmp, name) {
  const outBase = join(tmp, name);
  execFileSync(FBX2GLTF, ["-b", "-i", fbx, "-o", outBase, "--anim-framerate", "bake30"], { stdio: ["ignore", "ignore", "ignore"] });
  return `${outBase}.glb`;
}

/** Keep the hip Y bob but pin X/Z so a looping walk does not drift. */
function pinRootMotion(animation, hips) {
  for (const channel of animation.listChannels()) {
    if (channel.getTargetNode() !== hips || channel.getTargetPath() !== "translation") continue;
    const output = channel.getSampler()?.getOutput();
    if (!output) continue;
    const array = output.getArray().slice();
    const x0 = array[0];
    const z0 = array[2];
    for (let i = 0; i < array.length; i += 3) {
      array[i] = x0;
      array[i + 2] = z0;
    }
    output.setArray(array);
  }
}

function findNodeByName(document, name) {
  return document.getRoot().listNodes().find((node) => node.getName() === name) ?? null;
}

function attachClip(skinDoc, clipDoc, clipName) {
  const sourceAnim = clipDoc.getRoot().listAnimations()[0];
  if (!sourceAnim) throw new Error(`no animation in ${clipName}`);
  sourceAnim.setName(clipName);
  const sourceScene = clipDoc.getRoot().listScenes()[0];
  const map = mergeDocuments(skinDoc, clipDoc);
  const anim = map.get(sourceAnim);
  const scene = map.get(sourceScene);
  // Point every channel at the skin's node of the same name, then drop the duplicate rig.
  for (const channel of anim.listChannels()) {
    const target = channel.getTargetNode();
    if (!target) continue;
    const match = findNodeByName(skinDoc, target.getName());
    if (match && match !== target) channel.setTargetNode(match);
    else if (!match) {
      const sampler = channel.getSampler();
      channel.dispose();
      sampler?.dispose();
    }
  }
  const orphan = [];
  scene?.traverse((node) => orphan.push(node));
  scene?.dispose();
  for (const node of orphan) node.dispose();
  return anim;
}

/** Animation.dispose() leaves its channels and samplers (and their accessors) behind. */
function disposeAnimation(animation) {
  for (const channel of animation.listChannels()) {
    const sampler = channel.getSampler();
    channel.dispose();
    if (sampler && sampler.listParents().every((parent) => parent.propertyType === "Root")) {
      sampler.getInput()?.dispose();
      sampler.getOutput()?.dispose();
      sampler.dispose();
    }
  }
  animation.dispose();
}

/** Samplers detached from every Animation keep their accessors alive through write; drop them. */
function sweepOrphans(document) {
  const root = document.getRoot();
  const live = new Set();
  for (const animation of root.listAnimations()) for (const sampler of animation.listSamplers()) live.add(sampler);
  for (const accessor of root.listAccessors()) {
    for (const parent of accessor.listParents()) {
      if (parent.propertyType === "AnimationSampler" && !live.has(parent)) parent.dispose();
    }
  }
  for (const accessor of root.listAccessors()) {
    if (accessor.listParents().every((parent) => parent.propertyType === "Root")) accessor.dispose();
  }
}

function hipsOf(document) {
  return document.getRoot().listNodes().find((node) => /hips$/i.test(node.getName())) ?? null;
}

async function convertCharacter(character) {
  const dir = join(SRC, character.dir);
  const skinFbx = join(dir, `${character.dir}.fbx`);
  if (!existsSync(skinFbx)) {
    console.warn(`skip ${character.slug}: missing ${skinFbx}`);
    return;
  }
  const tmp = mkdtempSync(join(tmpdir(), `mixamo-${character.slug}-`));
  try {
    const clipFiles = listFbx(dir).filter((file) => file !== skinFbx);
    const byStem = new Map();
    for (const file of clipFiles) {
      const key = stem(file);
      // Prefer the pack version (smaller, animation only) over a with-skin single.
      if (!byStem.has(key) || statSync(file).size < statSync(byStem.get(key)).size) byStem.set(key, file);
    }

    const skinDoc = await io.read(fbxToGlb(skinFbx, tmp, "skin"));
    for (const anim of skinDoc.getRoot().listAnimations()) disposeAnimation(anim);
    const hips = hipsOf(skinDoc);
    if (!hips) throw new Error(`${character.slug}: no Hips node`);

    const attached = [];
    for (const [clipName, candidates] of Object.entries(character.clips)) {
      const file = candidates.map((candidate) => byStem.get(candidate)).find(Boolean);
      if (!file) {
        console.warn(`  ${character.slug}: no file for clip "${clipName}" (${candidates.join(", ")})`);
        continue;
      }
      const clipDoc = await io.read(fbxToGlb(file, tmp, `clip-${clipName}`));
      const anim = attachClip(skinDoc, clipDoc, clipName);
      if (IN_PLACE.has(clipName)) pinRootMotion(anim, hips);
      attached.push(clipName);
    }

    // Mixamo ships a second UV set nothing uses.
    for (const mesh of skinDoc.getRoot().listMeshes()) {
      for (const prim of mesh.listPrimitives()) {
        const uv1 = prim.getAttribute("TEXCOORD_1");
        if (uv1) prim.setAttribute("TEXCOORD_1", null);
      }
    }
    await skinDoc.transform(
      dedup(),
      prune(),
      resample(),
      quantize({ quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12 }),
      textureCompress({
        encoder: sharp,
        targetFormat: "webp",
        resize: [1024, 1024],
        quality: 82,
      }),
      prune(),
    );
    sweepOrphans(skinDoc);
    await skinDoc.transform(unpartition());
    mkdirSync(OUT, { recursive: true });
    const heroPath = join(OUT, `${character.slug}.glb`);
    await io.write(heroPath, skinDoc);
    report(character.slug, heroPath, skinDoc, attached);

    if (character.horde) {
      for (const anim of skinDoc.getRoot().listAnimations()) {
        if (!character.horde.includes(anim.getName())) disposeAnimation(anim);
      }
      const tris = inspect(skinDoc).meshes.properties.reduce((sum, mesh) => sum + mesh.glPrimitives, 0);
      const ratio = Math.min(1, HORDE_TRIS / Math.max(1, tris));
      await skinDoc.transform(
        weld(),
        simplify({ simplifier: MeshoptSimplifier, ratio, error: 0.01 }),
        textureCompress({ encoder: sharp, targetFormat: "webp", resize: [512, 512], quality: 75 }),
        prune(),
      );
      sweepOrphans(skinDoc);
      await skinDoc.transform(unpartition());
      const hordePath = join(OUT, `${character.slug}.horde.glb`);
      await io.write(hordePath, skinDoc);
      report(`${character.slug}.horde`, hordePath, skinDoc, character.horde);
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

function report(name, path, document, clips) {
  const info = inspect(document);
  const tris = info.meshes.properties.reduce((sum, mesh) => sum + mesh.glPrimitives, 0);
  const kb = Math.round(statSync(path).size / 1024);
  const textures = info.textures.properties.map((texture) => texture.resolution).join(",");
  console.log(`${name.padEnd(24)} ${String(kb).padStart(6)} KB  ${String(tris).padStart(6)} tris  tex[${textures}]  clips: ${clips.join(" ")}`);
}

if (!existsSync(FBX2GLTF)) {
  console.error(`FBX2glTF binary not found at ${FBX2GLTF}; run npm install`);
  process.exit(1);
}
for (const character of CHARACTERS) {
  if (only.size > 0 && !only.has(character.slug)) continue;
  await convertCharacter(character);
}
