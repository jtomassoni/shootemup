import { destinationById, type Avatar } from "@/game/content";
import { drawHud } from "@/render/paint";
import { H, PLAYER_Y, W, type Enemy, type RunState, type StyleId } from "@/game/types";
import {
  ACESFilmicToneMapping,
  AnimationClip,
  AnimationMixer,
  BoxGeometry,
  CanvasTexture,
  CircleGeometry,
  ClampToEdgeWrapping,
  Color,
  CylinderGeometry,
  DynamicDrawUsage,
  Fog,
  Group,
  Box3,
  DirectionalLight,
  HemisphereLight,
  InstancedBufferAttribute,
  InstancedMesh,
  LinearFilter,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  DoubleSide,
  NoToneMapping,
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  RepeatWrapping,
  Scene,
  SkinnedMesh,
  SphereGeometry,
  TorusGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
  type BufferAttribute,
  BufferGeometry,
  Float32BufferAttribute,
  type Material,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";

const SPAN_Z = 46;
/** Steep enough that the road fills the phone, the way the minigame ads do. */
const FOV = 50;
const CAMERA_Y = 8.2;
const CAMERA_Z = -1.2;
const LOOK_Y = 0;
const LOOK_Z = 10;
/** Pulls the shooter off the lens so the whole body stays in frame. */
const NEAR_Z = 5.6;
const LANE_TAN_H = Math.tan((FOV * Math.PI) / 360) * (W / H);
const LANE_FORWARD_LEN = Math.hypot(LOOK_Y - CAMERA_Y, LOOK_Z - CAMERA_Z);
const LANE_FORWARD_Y = (LOOK_Y - CAMERA_Y) / LANE_FORWARD_LEN;
const LANE_FORWARD_Z = (LOOK_Z - CAMERA_Z) / LANE_FORWARD_LEN;
const LANE_EYE_Y = CAMERA_Y;
const LANE_EYE_Z = CAMERA_Z;
const CROWD_CAP = 360;
/** Fitted avatars are about 1.7 units tall. This keeps them a person on the road, not a giant in the foreground. */
const PLAYER_SCALE = 0.55;

const AVATAR_FILE: Record<string, string> = {
  nurse: "WardNurse",
  engineer: "ItEngineer",
  driver: "CombatEngineer",
  conductor: "StockClerk",
  chef: "FoodCourier",
  pilot: "ArmyOfficer",
  ranger: "Scout",
  crabber: "SecurityGuard",
  cyclist: "FoodCourier",
  barista: "Cashier",
};

type ZombieKind = "shambler" | "crawler" | "brute" | "reacher";

type SpriteSpec = { file?: string; procedural?: ProceduralKind; height: number };

type ProceduralKind = "car" | "train" | "boat" | "case" | "hole" | "tires" | ZombieKind;

const WALK_FRAMES = 4;

const SPRITE: Record<string, SpriteSpec> = {
  shambler: { procedural: "shambler", height: 1.45 },
  crawler: { procedural: "crawler", height: 1.15 },
  brute: { procedural: "brute", height: 1.6 },
  reacher: { procedural: "reacher", height: 1.45 },
  hail: { file: "Rock001", height: 0.42 },
  driver: { procedural: "car", height: 1 },
  car: { procedural: "car", height: 1 },
  train: { procedural: "train", height: 1 },
  skiff: { procedural: "boat", height: 1 },
  luggage: { procedural: "case", height: 1 },
  pothole: { procedural: "hole", height: 1 },
  tires: { procedural: "tires", height: 1 },
};

type Template = {
  scene: Object3D;
  clips: AnimationClip[];
  crowd: InstancedMesh | null;
};

type Actor = {
  root: Group;
  mixer: AnimationMixer | null;
  label: Sprite | null;
  shownHp: number;
};

const numberTextures = new Map<number, CanvasTexture>();
const dummy = new Object3D();
const projector = new Vector3();
const white = new Color("#ffffff");
const flashTint = new Color("#fff1c2");
const shotTint = new Color("#ffffff");
const crateTint = new Color("#ffffff");

/** World half-width that fills the screen at this depth. Grows with distance. */
function laneHalfWidth(z: number) {
  const zCam = (0 - LANE_EYE_Y) * LANE_FORWARD_Y + (z - LANE_EYE_Z) * LANE_FORWARD_Z;
  return Math.max(0.2, zCam * LANE_TAN_H);
}

function lanePoint(x: number, y: number) {
  const across = (x - W / 2) / (W / 2);
  const depth = Math.max(0, Math.min(1.08, (PLAYER_Y - y) / (PLAYER_Y + 70)));
  const z = NEAR_Z + depth * SPAN_Z;
  // Scale width with depth so one lane stays a vertical line on screen.
  // A constant world width makes the near road much wider than the camera,
  // so a small slide toward either edge throws the character off screen.
  // Camera right is world -X, so negate across: finger right, character right.
  return { x: -across * laneHalfWidth(z), z, depth };
}

function laneRibbon(z0: number, z1: number, segments: number, fraction = 1) {
  const geometry = new BufferGeometry();
  const positions = new Float32Array((segments + 1) * 6);
  const uvs = new Float32Array((segments + 1) * 4);
  const indices: number[] = [];
  for (let i = 0; i <= segments; i += 1) {
    const t = i / segments;
    const z = z0 + (z1 - z0) * t;
    const half = laneHalfWidth(z) * fraction;
    const vertex = i * 2;
    positions.set([-half, 0.02, z, half, 0.02, z], vertex * 3);
    uvs.set([0, t, 1, t], vertex * 2);
    if (i < segments) {
      indices.push(vertex, vertex + 2, vertex + 1, vertex + 1, vertex + 2, vertex + 3);
    }
  }
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function clipNamed(clips: AnimationClip[], names: string[]) {
  for (const name of names) {
    const found = AnimationClip.findByName(clips, name);
    if (found) return found;
  }
  return clips[0] ?? null;
}

function findSkinned(root: Object3D): SkinnedMesh | null {
  let found: SkinnedMesh | null = null;
  root.traverse((child) => {
    if (!found && (child as SkinnedMesh).isSkinnedMesh) found = child as SkinnedMesh;
  });
  return found;
}

function findMesh(root: Object3D): Mesh | null {
  let found: Mesh | null = null;
  root.traverse((child) => {
    if (!found && (child as Mesh).isMesh) found = child as Mesh;
  });
  return found;
}

function oneMaterial(material: Material | Material[]): Material {
  return Array.isArray(material) ? material[0]! : material;
}

function bakeSkinned(mesh: SkinnedMesh): BufferGeometry {
  mesh.skeleton.update();
  const geometry = mesh.geometry.clone();
  const position = geometry.attributes.position as BufferAttribute;
  const skinIndex = geometry.attributes.skinIndex as BufferAttribute;
  const skinWeight = geometry.attributes.skinWeight as BufferAttribute;
  const boneMatrices = mesh.skeleton.boneMatrices;
  const vertex = new Vector3();
  const temp = new Vector3();
  const skinned = new Vector3();
  const boneMatrix = new Matrix4();
  for (let i = 0; i < position.count; i += 1) {
    vertex.fromBufferAttribute(position, i).applyMatrix4(mesh.bindMatrix);
    skinned.set(0, 0, 0);
    for (let joint = 0; joint < 4; joint += 1) {
      const weight = skinWeight.getComponent(i, joint);
      if (weight === 0) continue;
      boneMatrix.fromArray(boneMatrices, skinIndex.getComponent(i, joint) * 16);
      temp.copy(vertex).applyMatrix4(boneMatrix).multiplyScalar(weight);
      skinned.add(temp);
    }
    skinned.applyMatrix4(mesh.bindMatrixInverse);
    position.setXYZ(i, skinned.x, skinned.y, skinned.z);
  }
  geometry.deleteAttribute("skinIndex");
  geometry.deleteAttribute("skinWeight");
  geometry.computeVertexNormals();
  stripMorphs(geometry);
  return geometry;
}

function stripMorphs(geometry: BufferGeometry) {
  geometry.morphAttributes = {};
  geometry.morphTargetsRelative = false;
}

function fitHeight(geometry: BufferGeometry, height: number) {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  if (!box) return;
  const size = Math.max(0.001, box.max.y - box.min.y);
  const scale = height / size;
  geometry.translate(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
  geometry.scale(scale, scale, scale);
}

function numberTexture(hp: number) {
  const value = Math.max(0, Math.ceil(hp));
  const cached = numberTextures.get(value);
  if (cached) return cached;
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d");
  ctx.font = "800 96px Avenir Next, Trebuchet MS, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineWidth = 16;
  ctx.strokeStyle = "#ffffff";
  ctx.strokeText(String(value), 128, 68);
  ctx.fillStyle = "#e10600";
  ctx.fillText(String(value), 128, 68);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  numberTextures.set(value, texture);
  return texture;
}

function colored(color: string, roughness = 0.7) {
  return new MeshStandardMaterial({ color, roughness, metalness: 0.04 });
}

function selectionRing() {
  const ring = new Mesh(
    new TorusGeometry(0.62, 0.055, 8, 28),
    new MeshBasicMaterial({ color: "#3dff6a" }),
  );
  ring.rotation.x = -Math.PI / 2;
  return ring;
}

function gunPaint(id: string) {
  if (id.includes("spread") || id.includes("spice")) return "#ff3b30";
  if (id.includes("train") || id.includes("horn")) return "#ffe14a";
  if (id.includes("pot")) return "#3ddc84";
  if (id.includes("mallet")) return "#ff7a18";
  return "#7cff6b";
}

function buildCar() {
  const root = new Group();
  const body = new Mesh(new BoxGeometry(1.15, 0.42, 2.05), colored("#d8572a"));
  body.position.set(0, 0.48, 0);
  const cabin = new Mesh(new BoxGeometry(0.96, 0.38, 0.9), colored("#d7eef8", 0.25));
  cabin.position.set(0, 0.82, -0.12);
  const glass = new Mesh(new BoxGeometry(0.88, 0.28, 0.78), new MeshStandardMaterial({ color: "#9fd4ea", roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.85 }));
  glass.position.set(0, 0.84, -0.12);
  root.add(body, cabin, glass);
  for (const [x, z] of [[-0.48, 0.62], [0.48, 0.62], [-0.48, -0.68], [0.48, -0.68]] as const) {
    const wheel = new Mesh(new CylinderGeometry(0.22, 0.22, 0.16, 10), colored("#1c2430"));
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, 0.22, z);
    root.add(wheel);
  }
  for (const x of [-0.32, 0.32]) {
    const lamp = new Mesh(new SphereGeometry(0.08, 8, 8), new MeshBasicMaterial({ color: "#fff4c2" }));
    lamp.position.set(x, 0.5, 1.02);
    root.add(lamp);
  }
  return root;
}

function buildTrain() {
  const root = new Group();
  const boiler = new Mesh(new BoxGeometry(1.15, 0.85, 2.4), colored("#b4533a"));
  boiler.position.set(0, 0.7, 0);
  const cab = new Mesh(new BoxGeometry(1.25, 1.05, 0.85), colored("#6f4e37"));
  cab.position.set(0, 0.95, -0.85);
  const stack = new Mesh(new CylinderGeometry(0.14, 0.18, 0.45, 8), colored("#2b2d42"));
  stack.position.set(0, 1.3, 0.45);
  const nose = new Mesh(new BoxGeometry(0.9, 0.28, 0.4), colored("#1c2430"));
  nose.position.set(0, 0.28, 1.2);
  root.add(boiler, cab, stack, nose);
  const lamp = new Mesh(new SphereGeometry(0.1, 8, 8), new MeshBasicMaterial({ color: "#fff1a8" }));
  lamp.position.set(0, 0.85, 1.22);
  root.add(lamp);
  return root;
}

function buildBoat() {
  const root = new Group();
  const hull = new Mesh(new BoxGeometry(1.5, 0.38, 2.3), colored("#bc6c25"));
  hull.position.y = 0.28;
  const cabin = new Mesh(new BoxGeometry(0.7, 0.4, 0.7), colored("#f4f1de"));
  cabin.position.set(0, 0.62, -0.2);
  root.add(hull, cabin);
  return root;
}

function buildCase() {
  const root = new Group();
  const box = new Mesh(new BoxGeometry(0.7, 0.85, 0.42), colored("#c1121f"));
  box.position.y = 0.48;
  const handle = new Mesh(new BoxGeometry(0.28, 0.08, 0.08), colored("#1c2430"));
  handle.position.y = 0.96;
  root.add(box, handle);
  return root;
}

function buildHole() {
  const root = new Group();
  const hole = new Mesh(new CircleGeometry(0.7, 18), new MeshBasicMaterial({ color: "#1a1d24" }));
  hole.rotation.x = -Math.PI / 2;
  hole.position.y = 0.03;
  const rim = new Mesh(new CircleGeometry(0.92, 18), new MeshBasicMaterial({ color: "#3d4450" }));
  rim.rotation.x = -Math.PI / 2;
  rim.position.y = 0.02;
  root.add(rim, hole);
  return root;
}

function buildProcedural(kind: ProceduralKind) {
  if (kind === "car") return buildCar();
  if (kind === "train") return buildTrain();
  if (kind === "boat") return buildBoat();
  if (kind === "case") return buildCase();
  if (kind === "hole") return buildHole();
  if (kind === "tires") return buildTires();
  return buildZombie(kind);
}

function buildTires() {
  const root = new Group();
  const rubber = colored("#1a1c1e", 0.92);
  const rim = colored("#8d9398", 0.45);
  for (let i = 0; i < 3; i += 1) {
    const tire = new Mesh(new TorusGeometry(0.36, 0.13, 8, 18), rubber);
    tire.rotation.x = Math.PI / 2;
    tire.position.y = 0.16 + i * 0.24;
    const hub = new Mesh(new CylinderGeometry(0.12, 0.12, 0.08, 10), rim);
    hub.position.y = tire.position.y;
    root.add(tire, hub);
  }
  return root;
}

function bakeGun() {
  const parts: BufferGeometry[] = [];
  const add = (w: number, h: number, d: number, x: number, y: number, z: number) => {
    const geometry = new BoxGeometry(w, h, d);
    geometry.translate(x, y, z);
    parts.push(geometry);
  };
  add(0.22, 0.16, 0.72, 0, 0.62, 0.05);
  add(0.1, 0.1, 0.78, 0, 0.7, 0.62);
  add(0.08, 0.08, 0.22, 0, 0.78, 0.95);
  add(0.16, 0.32, 0.14, 0, 0.36, -0.08);
  add(0.2, 0.1, 0.34, 0, 0.52, -0.32);
  const merged = mergeGeometries(parts, false);
  parts.forEach((geometry) => geometry.dispose());
  if (!merged) throw new Error("gun");
  merged.computeBoundingBox();
  merged.translate(0, -(merged.boundingBox?.min.y ?? 0), 0);
  return merged;
}

function buildHordeFrames(kind: ZombieKind) {
  const material = new MeshStandardMaterial({ vertexColors: true, roughness: 0.84, metalness: 0 });
  const frames: InstancedMesh[] = [];
  for (let frame = 0; frame < WALK_FRAMES; frame += 1) {
    const geometry = bakeZombie(kind, frame / WALK_FRAMES);
    const mesh = new InstancedMesh(geometry, material, CROWD_CAP);
    mesh.count = 0;
    mesh.frustumCulled = false;
    mesh.instanceColor = new InstancedBufferAttribute(new Float32Array(CROWD_CAP * 3).fill(1), 3);
    mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    frames.push(mesh);
  }
  return frames;
}

function buildZombie(kind: ZombieKind) {
  const root = new Group();
  const bulk = kind === "brute" ? 1.16 : kind === "crawler" ? 0.9 : 1;
  const skin = kind === "brute" ? "#7e8b60" : kind === "crawler" ? "#8d7b5c" : "#9aaf70";
  const shade = kind === "crawler" ? "#6a5b45" : "#6f8454";
  const shirt = kind === "brute" ? "#6b3034" : kind === "reacher" ? "#d5ccb4" : kind === "crawler" ? "#4a3d36" : "#5c6870";
  const body = new Group();
  body.name = "body";
  body.position.y = 0.7;
  body.scale.set(bulk, kind === "brute" ? 1.08 : 1, bulk);
  root.add(body);

  body.add(chunk(0.42, 0.46, 0.24, skin, 0, 0.16, 0));
  body.add(chunk(0.46, 0.2, 0.28, shirt, 0, 0.28, 0.015));
  body.add(chunk(0.14, 0.1, 0.12, shade, 0, 0.42, 0));
  body.add(chunk(0.1, 0.1, 0.05, shirt, -0.12, 0.14, 0.12));
  body.add(chunk(0.36, 0.16, 0.22, "#262a28", 0, -0.08, 0));
  body.add(chunk(0.1, 0.08, 0.04, "#7a3540", 0.06, 0.2, 0.13));

  const head = new Group();
  head.name = "head";
  head.position.set(0, 0.5, 0.02);
  body.add(head);
  head.add(chunk(0.32, 0.3, 0.3, skin, 0, 0.16, 0));
  head.add(chunk(0.09, 0.07, 0.05, "#1a1612", -0.08, 0.2, 0.14));
  head.add(chunk(0.09, 0.08, 0.05, "#1a1612", 0.08, 0.19, 0.14));
  head.add(chunk(0.04, 0.04, 0.03, "#e7f0c2", -0.075, 0.2, 0.17));
  head.add(chunk(0.035, 0.045, 0.03, "#e7f0c2", 0.09, 0.185, 0.17));
  head.add(chunk(0.16, 0.07, 0.08, "#3a2026", 0, 0.06, 0.11));
  head.add(chunk(0.12, 0.09, 0.1, shade, 0, 0.03, 0.08));
  head.add(chunk(0.035, 0.045, 0.025, "#efe8da", -0.035, 0.055, 0.155));
  head.add(chunk(0.03, 0.04, 0.025, "#efe8da", 0.03, 0.05, 0.155));

  body.add(limb("armL", -0.3, 0.34, 0, { reach: kind === "reacher" ? 0.64 : 0.3, upper: skin, lower: shade }));
  body.add(limb("armR", 0.3, 0.34, 0, { reach: kind === "crawler" ? 0.16 : 0.28, upper: skin, lower: shade }));

  const legL = limb("legL", -0.12, 0.62, kind === "crawler" ? 0.16 : 0, { reach: 0.28, upper: "#262a28", lower: "#1c1e1c", leg: true });
  const legR = limb("legR", 0.12, 0.62, kind === "crawler" ? 0.16 : 0, { reach: 0.28, upper: "#262a28", lower: "#1c1e1c", leg: true });
  if (kind === "brute") {
    legL.scale.set(1.3, 1.02, 1.3);
    legR.scale.set(1.3, 1.02, 1.3);
  }
  root.add(legL, legR);
  root.userData.pose = (phase: number) => poseZombie(root, kind, phase);
  poseZombie(root, kind, 0);
  return root;
}

function poseZombie(root: Group, kind: ZombieKind, phase: number) {
  const step = Math.sin(phase * Math.PI * 2);
  const body = root.getObjectByName("body");
  const head = root.getObjectByName("head");
  const armL = root.getObjectByName("armL");
  const armR = root.getObjectByName("armR");
  const legL = root.getObjectByName("legL");
  const legR = root.getObjectByName("legR");
  if (!body || !head || !armL || !armR || !legL || !legR) return;
  body.rotation.x = kind === "crawler" ? 0.85 : kind === "brute" ? 0.12 : 0.18;
  body.rotation.z = step * 0.07;
  body.position.y = 0.68 + Math.abs(step) * 0.035;
  head.rotation.x = kind === "crawler" ? 0.25 : -0.22;
  head.rotation.z = -step * 0.14;
  armL.rotation.x = (kind === "reacher" ? -1.2 : -0.5) + step * 0.38;
  armR.rotation.x = (kind === "crawler" ? -0.15 : -0.35) - step * 0.38;
  armL.rotation.z = kind === "brute" ? -0.72 : -0.4;
  armR.rotation.z = kind === "brute" ? 0.72 : kind === "crawler" ? 0.2 : 0.5;
  legL.rotation.x = -step * (kind === "crawler" ? 0.28 : 0.58);
  legR.rotation.x = step * (kind === "crawler" ? 0.28 : 0.58);
}

function limb(
  name: string,
  x: number,
  y: number,
  z: number,
  opts: { reach: number; upper: string; lower: string; leg?: boolean },
) {
  const pivot = new Group();
  pivot.name = name;
  pivot.position.set(x, y, z);
  const upperLen = opts.leg ? 0.32 : 0.28;
  const thick = opts.leg ? 0.15 : 0.12;
  pivot.add(chunk(thick, upperLen, thick, opts.upper, 0, -upperLen / 2, 0));
  const joint = new Group();
  joint.position.y = -upperLen;
  joint.rotation.x = opts.leg ? 0.45 : -0.7;
  const lowerLen = opts.leg ? 0.28 : opts.reach;
  joint.add(chunk(thick * 0.88, lowerLen, thick * 0.88, opts.lower, 0, -lowerLen / 2, 0));
  joint.add(chunk(
    opts.leg ? 0.16 : thick * 0.8,
    opts.leg ? 0.08 : 0.08,
    opts.leg ? 0.22 : thick * 0.8,
    opts.leg ? "#171917" : opts.lower,
    0,
    -lowerLen,
    opts.leg ? 0.05 : 0,
  ));
  pivot.add(joint);
  return pivot;
}

function chunk(w: number, h: number, d: number, color: string, x: number, y: number, z: number) {
  const mesh = new Mesh(new BoxGeometry(w, h, d), colored(color, 0.82));
  mesh.position.set(x, y, z);
  return mesh;
}

function bakeZombie(kind: ZombieKind, phase: number) {
  const rig = buildZombie(kind);
  const pose = rig.userData.pose as (phase: number) => void;
  pose(phase);
  rig.updateMatrixWorld(true);
  const parts: BufferGeometry[] = [];
  rig.traverse((child) => {
    const mesh = child as Mesh;
    if (!mesh.isMesh) return;
    const geometry = mesh.geometry.clone();
    geometry.applyMatrix4(mesh.matrixWorld);
    paintGeometry(geometry, (oneMaterial(mesh.material) as MeshStandardMaterial).color);
    parts.push(geometry);
  });
  const merged = mergeGeometries(parts, false);
  parts.forEach((geometry) => geometry.dispose());
  disposeRig(rig);
  if (!merged) throw new Error(`Could not build ${kind}`);
  return merged;
}

function paintGeometry(geometry: BufferGeometry, color: Color) {
  const count = geometry.attributes.position?.count ?? 0;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
}

function disposeRig(root: Object3D) {
  root.traverse((child) => {
    const mesh = child as Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry.dispose();
    const material = mesh.material;
    if (Array.isArray(material)) material.forEach((item) => item.dispose());
    else material.dispose();
  });
}

function roadTexture(_asphalt: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d");
  ctx.fillStyle = "#6a7178";
  ctx.fillRect(0, 0, 128, 512);
  for (let i = 0; i < 900; i += 1) {
    ctx.fillStyle = i % 2 === 0 ? "rgba(255,255,255,0.045)" : "rgba(0,0,0,0.08)";
    ctx.fillRect((i * 47) % 128, (i * 19) % 512, 2, 1);
  }
  ctx.fillStyle = "#f4f1ea";
  ctx.fillRect(0, 0, 4, 512);
  ctx.fillRect(124, 0, 4, 512);
  ctx.fillStyle = "#f2d34b";
  for (let y = 8; y < 512; y += 64) ctx.fillRect(58, y, 12, 28);
  const texture = new CanvasTexture(canvas);
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = RepeatWrapping;
  texture.repeat.set(1, 8);
  texture.colorSpace = SRGBColorSpace;
  texture.magFilter = LinearFilter;
  return texture;
}

export class LaneStage {
  private renderer: WebGLRenderer;
  private scene = new Scene();
  private camera: PerspectiveCamera;
  private hemi: HemisphereLight;
  private templates = new Map<string, Template>();
  private pools = new Map<string, Actor[]>();
  private active = new Map<number, Actor>();
  private player: Actor | null = null;
  private buddy: Actor | null = null;
  private avatarId = "";
  private scenery = new Group();
  private roadMap: CanvasTexture | null = null;
  private shadows: InstancedMesh;
  private bullets: InstancedMesh;
  private crates: InstancedMesh;
  private flash: Mesh;
  private ring: Mesh;
  private buddyRing: Mesh;
  private props: { object: Object3D; base: number; side: number }[] = [];
  private zombieFrames = new Map<ZombieKind, InstancedMesh[]>();
  private viewW = 1;
  private viewH = 1;
  private dpr = 1;
  private style: StyleId = "chunky";
  private ready = false;

  constructor(
    private canvas: HTMLCanvasElement,
    private hud: HTMLCanvasElement,
  ) {
    this.renderer = new WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "high-performance" });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.setClearColor("#9eb4a4", 1);
    this.camera = new PerspectiveCamera(FOV, 1, 0.25, 160);
    this.camera.position.set(0, CAMERA_Y, CAMERA_Z);
    this.camera.lookAt(0, LOOK_Y, LOOK_Z);
    this.hemi = new HemisphereLight("#d7e4d2", "#3d4a32", 0.88);
    this.scene.add(this.hemi);
    const sun = new DirectionalLight("#fff0cc", 1.05);
    sun.position.set(-8, 8, -3);
    this.scene.add(sun);
    this.buildHorde();

    const shadowGeo = new CircleGeometry(0.45, 14);
    const shadowMat = new MeshBasicMaterial({ color: "#12160f", transparent: true, opacity: 0.28, depthWrite: false });
    this.shadows = new InstancedMesh(shadowGeo, shadowMat, CROWD_CAP + 16);
    this.shadows.count = 0;
    this.shadows.frustumCulled = false;
    this.shadows.instanceMatrix.setUsage(DynamicDrawUsage);
    this.scene.add(this.shadows);

    const bulletGeo = new BoxGeometry(1, 1, 1);
    const bulletMat = new MeshBasicMaterial({ color: "#fff6c8" });
    this.bullets = new InstancedMesh(bulletGeo, bulletMat, 240);
    this.bullets.count = 0;
    this.bullets.frustumCulled = false;
    this.bullets.instanceColor = new InstancedBufferAttribute(new Float32Array(240 * 3), 3);
    this.bullets.instanceMatrix.setUsage(DynamicDrawUsage);
    this.scene.add(this.bullets);

    const crateGeo = bakeGun();
    const crateMat = new MeshStandardMaterial({ color: "#ffffff", roughness: 0.45, metalness: 0.15 });
    this.crates = new InstancedMesh(crateGeo, crateMat, 8);
    this.crates.count = 0;
    this.crates.frustumCulled = false;
    this.crates.instanceColor = new InstancedBufferAttribute(new Float32Array(8 * 3), 3);
    this.scene.add(this.crates);

    this.flash = new Mesh(new SphereGeometry(0.16, 8, 8), new MeshBasicMaterial({ color: "#fff6c2" }));
    this.flash.visible = false;
    this.scene.add(this.flash);
    this.ring = selectionRing();
    this.buddyRing = selectionRing();
    this.buddyRing.visible = false;
    this.scene.add(this.ring, this.buddyRing);
    this.scene.add(this.scenery);
  }

  async load() {
    const loader = new GLTFLoader();
    const files = new Set<string>([
      ...Object.values(AVATAR_FILE),
      "Mountain001",
      "Hill001",
      "Bush001",
      "Grass003",
    ]);
    for (const spec of Object.values(SPRITE)) {
      if (spec.file) files.add(spec.file);
    }
    await Promise.all([...files].map(async (file) => {
      const gltf = await loader.loadAsync(`/models/${file}.glb`);
      const height = specHeight(file);
      const skinned = findSkinned(gltf.scene);
      let crowd: InstancedMesh | null = null;
      if (skinned && gltf.animations.length > 0) {
        const preview = cloneSkeleton(gltf.scene);
        const mixer = new AnimationMixer(preview);
        const walk = clipNamed(gltf.animations, ["walk", "Walk", "Run", "Idle", "idle"]);
        if (walk) {
          const action = mixer.clipAction(walk);
          action.play();
          mixer.update(0.22);
        }
        preview.updateMatrixWorld(true);
        const posed = findSkinned(preview);
        if (posed) {
          posed.skeleton.update();
          const geometry = bakeSkinned(posed);
          fitHeight(geometry, height);
          const material = oneMaterial(posed.material).clone();
          crowd = new InstancedMesh(geometry, material, CROWD_CAP);
          crowd.count = 0;
          crowd.frustumCulled = false;
          crowd.instanceColor = new InstancedBufferAttribute(new Float32Array(CROWD_CAP * 3).fill(1), 3);
          crowd.instanceMatrix.setUsage(DynamicDrawUsage);
          this.scene.add(crowd);
        }
      } else {
        const mesh = findMesh(gltf.scene);
        if (mesh) {
          const geometry = mesh.geometry.clone();
          stripMorphs(geometry);
          fitHeight(geometry, height);
          const material = oneMaterial(mesh.material).clone();
          crowd = new InstancedMesh(geometry, material, CROWD_CAP);
          crowd.count = 0;
          crowd.frustumCulled = false;
          crowd.instanceColor = new InstancedBufferAttribute(new Float32Array(CROWD_CAP * 3).fill(1), 3);
          crowd.instanceMatrix.setUsage(DynamicDrawUsage);
          this.scene.add(crowd);
        }
      }
      this.templates.set(file, { scene: gltf.scene, clips: gltf.animations, crowd });
    }));
    this.ready = true;
  }

  resize(viewW: number, viewH: number, dpr: number) {
    this.viewW = Math.max(1, viewW);
    this.viewH = Math.max(1, viewH);
    this.dpr = dpr;
    this.applyStyle(this.style);
    this.camera.aspect = this.viewW / this.viewH;
    this.camera.updateProjectionMatrix();
    this.hud.width = Math.floor(this.viewW * (this.style === "pixel" ? 1 : dpr));
    this.hud.height = Math.floor(this.viewH * (this.style === "pixel" ? 1 : dpr));
    this.hud.style.width = `${this.viewW}px`;
    this.hud.style.height = `${this.viewH}px`;
  }

  render(state: RunState, style: StyleId, avatar: Avatar, showHitboxes: boolean, reducedMotion: boolean, dt: number) {
    if (!this.ready) return;
    if (style !== this.style) this.applyStyle(style);
    this.dress(state.destination);
    this.ensurePlayer(avatar);
    if (this.roadMap) this.roadMap.offset.y = -state.time * 0.55;
    const shake = reducedMotion ? 0 : state.shake;
    this.camera.position.set(Math.sin(state.time * 40) * shake * 0.012, CAMERA_Y, CAMERA_Z);
    this.camera.lookAt(0, LOOK_Y, LOOK_Z);
    this.syncActors(state, avatar, dt, reducedMotion);
    this.syncCrowd(state);
    this.syncShots(state);
    this.renderer.render(this.scene, this.camera);
    const ctx = this.hud.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.hud.width, this.hud.height);
    ctx.setTransform(this.hud.width / W, 0, 0, this.hud.height / H, 0, 0);
    drawHud(ctx, state, style, (x, y) => this.project(x, y));
    if (showHitboxes) this.paintHitboxes(ctx, state);
  }

  dispose() {
    this.renderer.dispose();
  }

  private applyStyle(style: StyleId) {
    this.style = style;
    const pixel = style === "pixel";
    this.renderer.setPixelRatio(pixel ? 0.42 : Math.min(this.dpr, 1.75));
    this.renderer.setSize(this.viewW, this.viewH, true);
    this.renderer.toneMapping = style === "chunky" ? ACESFilmicToneMapping : NoToneMapping;
    this.canvas.style.imageRendering = pixel ? "pixelated" : "auto";
    this.hemi.intensity = style === "illustrated" ? 0.62 : 1.05;
    this.hemi.color.set(style === "illustrated" ? "#ffe8c7" : "#f4fbff");
  }

  private dress(destinationId: string) {
    if (this.scenery.userData.destination === destinationId) return;
    this.scenery.clear();
    this.props = [];
    this.scenery.userData.destination = destinationId;
    const destination = destinationById(destinationId);
    const sky = new Color("#8ec4e6");
    this.scene.background = sky;
    this.scene.fog = new Fog("#d7c4a2", 26, 56);
    this.renderer.setClearColor(sky, 1);
    // Every vertex stays in front of the camera. A plane that straddles the
    // camera makes fog interpolation paint the whole lane the sky color.
    const groundMat = new MeshBasicMaterial({ color: "#c6a56b", side: DoubleSide });
    groundMat.fog = false;
    const ground = new Mesh(new PlaneGeometry(80, 72, 1, 12), groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, -0.06, 36);
    ground.frustumCulled = false;
    this.scenery.add(ground);
    this.roadMap = roadTexture(destination.road);
    const roadMat = new MeshStandardMaterial({
      map: this.roadMap,
      color: "#ffffff",
      roughness: 1,
      metalness: 0,
      side: DoubleSide,
    });
    roadMat.fog = false;
    const road = new Mesh(laneRibbon(0.4, 56, 24, 0.74), roadMat);
    road.frustumCulled = false;
    this.scenery.add(road);
    const postMat = new MeshStandardMaterial({ color: "#efe6d6", roughness: 0.9 });
    for (let i = 0; i < 18; i += 1) {
      const post = new Mesh(new CylinderGeometry(0.045, 0.045, 0.72, 5), postMat);
      post.position.y = 0.36;
      this.scenery.add(post);
      this.props.push({ object: post, base: 3 + i * 2.8, side: i % 2 === 0 ? -1 : 1 });
    }
  }

  private buildHorde() {
    const kinds: ZombieKind[] = ["shambler", "crawler", "brute", "reacher"];
    for (const kind of kinds) {
      const frames = buildHordeFrames(kind);
      for (const mesh of frames) this.scene.add(mesh);
      this.zombieFrames.set(kind, frames);
    }
  }

  private ensurePlayer(avatar: Avatar) {
    if (this.player && this.avatarId === avatar.id) return;
    if (this.player) this.scene.remove(this.player.root);
    const file = AVATAR_FILE[avatar.id] ?? "WardNurse";
    this.player = this.makeActor(file, ["Run", "Walk", "Idle"], avatar.id === "cyclist" ? "#9fd4ff" : null);
    this.avatarId = avatar.id;
    if (this.player) this.scene.add(this.player.root);
  }

  private makeActor(file: string, clipNames: string[], tint: string | null): Actor | null {
    const template = this.templates.get(file);
    if (!template) return null;
    const root = new Group();
    const model = cloneSkeleton(template.scene);
    model.traverse((child) => {
      const mesh = child as Mesh;
      if (!mesh.isMesh || !tint) return;
      const source = oneMaterial(mesh.material);
      const material = source.clone() as MeshStandardMaterial;
      if (material.color) material.color.multiply(new Color(tint));
      mesh.material = material;
    });
    fitActor(model, specHeight(file));
    root.add(model);
    let mixer: AnimationMixer | null = null;
    const clip = clipNamed(template.clips, clipNames);
    if (clip) {
      mixer = new AnimationMixer(model);
      const action = mixer.clipAction(clip);
      action.play();
      mixer.update(Math.random());
    }
    const labelMaterial = new SpriteMaterial({ transparent: true, depthTest: false });
    const label = new Sprite(labelMaterial);
    label.visible = false;
    label.position.y = specHeight(file) + 0.45;
    root.add(label);
    return { root, mixer, label, shownHp: -1 };
  }

  private borrow(key: string, clipNames: string[]): Actor | null {
    const pool = this.pools.get(key);
    const reused = pool?.pop();
    if (reused) {
      reused.root.visible = true;
      this.scene.add(reused.root);
      return reused;
    }
    if (key.startsWith("proc:")) {
      const root = buildProcedural(key.slice(5) as ProceduralKind);
      const labelMaterial = new SpriteMaterial({ transparent: true, depthTest: false });
      const label = new Sprite(labelMaterial);
      label.visible = false;
      label.position.y = 1.6;
      root.add(label);
      return { root, mixer: null, label, shownHp: -1 };
    }
    const actor = this.makeActor(key, clipNames, null);
    return actor;
  }

  private release(actor: Actor) {
    actor.root.visible = false;
    this.scene.remove(actor.root);
    const key = String(actor.root.userData.key ?? "");
    const pool = this.pools.get(key) ?? [];
    pool.push(actor);
    this.pools.set(key, pool);
  }

  private syncActors(state: RunState, avatar: Avatar, dt: number, reducedMotion: boolean) {
    const step = reducedMotion ? 0 : dt;
    if (this.player) {
      const point = lanePoint(state.playerX, state.playerY);
      const playerScale = PLAYER_SCALE * (this.style === "chunky" ? 1.08 : 1);
      this.player.root.position.set(point.x, 0, point.z);
      this.player.root.rotation.y = -state.aim;
      this.player.root.scale.setScalar(playerScale);
      this.player.mixer?.update(step);
      this.ring.position.set(point.x, 0.05, point.z);
      this.ring.scale.setScalar(1.15);
      this.flash.visible = state.muzzle > 0;
      this.flash.position.set(
        point.x - Math.sin(state.aim) * 0.35,
        1.15 * playerScale,
        point.z + Math.cos(state.aim) * 0.35,
      );
    }
    if (state.companion) {
      if (!this.buddy) {
        this.buddy = this.makeActor(AVATAR_FILE[avatar.id] ?? "WardNurse", ["Run", "Walk"], "#b8f4ff");
        if (this.buddy) this.scene.add(this.buddy.root);
      }
      if (this.buddy && this.player) {
        this.buddy.root.position.set(this.player.root.position.x - 0.42, 0, this.player.root.position.z + 0.28);
        this.buddy.root.rotation.y = 0;
        this.buddy.root.scale.setScalar(PLAYER_SCALE * 0.82);
        this.buddy.mixer?.update(step);
        this.buddyRing.visible = true;
        this.buddyRing.position.set(this.buddy.root.position.x, 0.05, this.buddy.root.position.z);
        this.buddyRing.scale.setScalar(0.85);
      }
    } else if (this.buddy) {
      this.scene.remove(this.buddy.root);
      this.buddy = null;
      this.buddyRing.visible = false;
    } else {
      this.buddyRing.visible = false;
    }

    const seen = new Set<number>();
    let shadow = 0;
    if (this.player) shadow = stampShadow(this.shadows, shadow, this.player.root.position.x, this.player.root.position.z, 0.32);
    for (const enemy of state.enemies) {
      if (!enemy.alive || isCrowd(enemy)) continue;
      seen.add(enemy.id);
      const spec = SPRITE[enemy.sprite] ?? SPRITE.shambler!;
      const key = spec.procedural ? `proc:${spec.procedural}` : spec.file ?? "shambler";
      let actor = this.active.get(enemy.id);
      if (!actor) {
        const created = this.borrow(key, ["walk", "Walk", "Run", "idle", "Idle"]);
        if (!created) continue;
        created.root.userData.key = key;
        this.scene.add(created.root);
        this.active.set(enemy.id, created);
        actor = created;
      }
      const point = lanePoint(enemy.x, enemy.y);
      const scale = bodyScale(enemy) * personScale(enemy) * (this.style === "chunky" ? 1.06 : 1);
      actor.root.visible = true;
      actor.root.position.set(point.x, enemy.sprite === "pothole" ? 0 : 0, point.z);
      actor.root.rotation.y = enemy.sprite === "pothole" || enemy.sprite === "hole-boss" ? 0 : Math.PI + enemy.vx * 0.02;
      actor.root.scale.setScalar(enemy.flash > 0 ? scale * 1.06 : scale);
      const pose = actor.root.userData.pose as ((phase: number) => void) | undefined;
      if (pose) pose(reducedMotion ? enemy.id * 0.2 : state.time * 1.45 + enemy.id * 0.17);
      if (!reducedMotion && !pose) actor.mixer?.update(dt);
      this.label(actor, enemy, scale);
      shadow = stampShadow(this.shadows, shadow, point.x, point.z, 0.38 * scale);
    }
    for (const [id, actor] of this.active) {
      if (seen.has(id)) continue;
      this.active.delete(id);
      this.release(actor);
    }
    this.shadows.count = shadow;
    this.shadows.instanceMatrix.needsUpdate = true;
    for (const prop of this.props) {
      const travel = reducedMotion ? prop.base : prop.base - state.time * 7;
      const loop = ((travel % 54) + 54) % 54;
      prop.object.position.z = loop - 2;
      prop.object.position.x = prop.side * laneHalfWidth(prop.object.position.z) * 0.78;
    }
  }

  private label(actor: Actor, enemy: Enemy, scale: number) {
    if (!actor.label || enemy.maxHp < 40) {
      if (actor.label) actor.label.visible = false;
      return;
    }
    const hp = Math.max(0, Math.ceil(enemy.hp));
    if (actor.shownHp !== hp) {
      actor.shownHp = hp;
      actor.label.material.map = numberTexture(hp);
      actor.label.material.needsUpdate = true;
    }
    actor.label.visible = true;
    const stack = enemy.sprite === "tires";
    const big = enemy.kind === "boss" || enemy.kind === "miniboss" || enemy.maxHp >= 80;
    const width = stack ? 1.7 : big ? 1.35 : 0.62;
    const height = stack ? 0.85 : big ? 0.66 : 0.3;
    actor.label.scale.set(width / scale, height / scale, 1);
    actor.label.position.y = stack ? 1.45 : big ? 2.35 : 1.62;
  }

  private syncCrowd(state: RunState) {
    const buckets = new Map<string, Enemy[]>();
    for (const enemy of state.enemies) {
      if (!enemy.alive || !isCrowd(enemy)) continue;
      const spec = SPRITE[enemy.sprite];
      const key = spec?.procedural ?? spec?.file;
      if (!key) continue;
      const list = buckets.get(key) ?? [];
      list.push(enemy);
      buckets.set(key, list);
    }
    let shadow = this.shadows.count;
    const stamp = (mesh: InstancedMesh, list: Enemy[]) => {
      const count = Math.min(list.length, CROWD_CAP);
      mesh.count = count;
      for (let i = 0; i < count; i += 1) {
        const enemy = list[i]!;
        const point = lanePoint(enemy.x, enemy.y);
        dummy.position.set(point.x, 0, point.z);
        dummy.rotation.set(0, Math.PI, 0);
        dummy.scale.setScalar((enemy.flash > 0 ? 1.08 : 1) * personScale(enemy));
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        mesh.setColorAt(i, enemy.flash > 0 ? flashTint : white);
        shadow = stampShadow(this.shadows, shadow, point.x, point.z, 0.34);
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    };
    for (const [kind, frames] of this.zombieFrames) {
      const list = buckets.get(kind) ?? [];
      const bins = frames.map(() => [] as Enemy[]);
      const rate = kind === "brute" ? 3.2 : kind === "crawler" ? 3.6 : 5;
      for (const enemy of list) {
        const frame = Math.floor((state.time * rate + enemy.id * 0.73) % frames.length);
        bins[frame]!.push(enemy);
      }
      frames.forEach((mesh, frame) => stamp(mesh, bins[frame]!));
    }
    for (const [file, template] of this.templates) {
      const mesh = template.crowd;
      if (!mesh) continue;
      stamp(mesh, buckets.get(file) ?? []);
    }
    this.shadows.count = Math.min(shadow, CROWD_CAP + 16);
    this.shadows.instanceMatrix.needsUpdate = true;
  }

  private syncShots(state: RunState) {
    const shots = state.bullets.filter((bullet) => bullet.alive);
    const count = Math.min(shots.length, 240);
    this.bullets.count = count;
    for (let i = 0; i < count; i += 1) {
      const bullet = shots[i]!;
      const ahead = lanePoint(bullet.x, bullet.y);
      const tail = 0.045;
      const behind = lanePoint(bullet.x - bullet.vx * tail, bullet.y - bullet.vy * tail);
      const midX = (ahead.x + behind.x) / 2;
      const midZ = (ahead.z + behind.z) / 2;
      const length = Math.hypot(ahead.x - behind.x, ahead.z - behind.z);
      const playerShot = bullet.from === "player";
      const thick = playerShot ? (bullet.kind === "pellet" ? 0.045 : 0.06) : 0.1;
      dummy.position.set(midX, playerShot ? 1.05 : 0.75, midZ);
      dummy.scale.set(1, 1, 1);
      dummy.lookAt(ahead.x, dummy.position.y, ahead.z);
      dummy.scale.set(thick, thick, Math.max(playerShot ? 0.28 : 0.16, length));
      dummy.updateMatrix();
      this.bullets.setMatrixAt(i, dummy.matrix);
      shotTint.set(playerShot ? "#fff3bf" : bullet.color);
      this.bullets.setColorAt(i, shotTint);
    }
    this.bullets.instanceMatrix.needsUpdate = true;
    if (this.bullets.instanceColor) this.bullets.instanceColor.needsUpdate = true;

    const crates = state.crates.filter((crate) => crate.alive);
    this.crates.count = Math.min(crates.length, 8);
    for (let i = 0; i < this.crates.count; i += 1) {
      const crate = crates[i]!;
      const point = lanePoint(crate.x, crate.y);
      dummy.position.set(point.x, 0.02 + Math.sin(state.time * 3 + crate.id) * 0.04, point.z);
      dummy.rotation.set(0, Math.PI, 0);
      dummy.scale.setScalar(1.45);
      dummy.updateMatrix();
      this.crates.setMatrixAt(i, dummy.matrix);
      crateTint.set(crate.offer.type === "companion" ? "#3ec6ff" : gunPaint(crate.offer.weaponId));
      this.crates.setColorAt(i, crateTint);
    }
    this.crates.instanceMatrix.needsUpdate = true;
    if (this.crates.instanceColor) this.crates.instanceColor.needsUpdate = true;
  }

  private project(x: number, y: number) {
    const point = lanePoint(x, y);
    projector.set(point.x, 1.1, point.z);
    projector.project(this.camera);
    return {
      x: (projector.x * 0.5 + 0.5) * W,
      y: (-projector.y * 0.5 + 0.5) * H,
    };
  }

  private paintHitboxes(ctx: CanvasRenderingContext2D, state: RunState) {
    ctx.save();
    ctx.strokeStyle = "#ff2d95";
    ctx.lineWidth = 1;
    const player = this.project(state.playerX, state.playerY);
    ctx.strokeRect(player.x - 8, player.y - 8, 16, 16);
    for (const enemy of state.enemies) {
      if (!enemy.alive) continue;
      const point = this.project(enemy.x, enemy.y);
      ctx.strokeRect(point.x - 10, point.y - 12, 20, 18);
    }
    ctx.restore();
  }
}

function specHeight(file: string) {
  if (file === "Rock001") return 0.42;
  if (file === "Hare" || file === "Seagull") return 0.8;
  if (file === "Scorpion") return 0.72;
  if (file === "Lamb") return 0.95;
  if (file === "Goat" || file === "Boar") return 1.15;
  if (file === "Doe" || file === "Eland" || file === "HighlandCow") return 1.55;
  if (file.startsWith("Mountain") || file.startsWith("Hill") || file.startsWith("Bush") || file.startsWith("Grass")) return 1;
  return 1.72;
}

function isCrowd(enemy: Enemy) {
  return enemy.archetype.startsWith("herd-") || enemy.sprite === "hail";
}

function personScale(enemy: Enemy) {
  const kind = SPRITE[enemy.sprite]?.procedural;
  if (kind === "shambler" || kind === "crawler" || kind === "brute" || kind === "reacher") return 0.78;
  return 1;
}

function bodyScale(enemy: Enemy) {
  if (enemy.kind === "boss") return 2.2;
  if (enemy.kind === "miniboss") return 1.55;
  if (enemy.sprite === "brute" && enemy.maxHp >= 80) return 1.85;
  if (enemy.sprite === "tires") return 0.92;
  if (enemy.sprite === "train" || enemy.sprite === "skiff") return 1.25;
  if (enemy.sprite === "car" || enemy.sprite === "driver") return 1.05;
  return 1;
}

function fitActor(model: Object3D, height: number) {
  model.updateMatrixWorld(true);
  const box = new Box3().setFromObject(model);
  const size = Math.max(0.001, box.max.y - box.min.y);
  if (!Number.isFinite(size)) return;
  model.scale.multiplyScalar(height / size);
  model.updateMatrixWorld(true);
  const fitted = new Box3().setFromObject(model);
  model.position.y -= fitted.min.y;
  model.position.x -= (fitted.min.x + fitted.max.x) / 2;
  model.position.z -= (fitted.min.z + fitted.max.z) / 2;
}

function stampShadow(mesh: InstancedMesh, index: number, x: number, z: number, radius: number) {
  if (index >= CROWD_CAP + 16) return index;
  dummy.position.set(x, 0.03, z);
  dummy.rotation.set(-Math.PI / 2, 0, 0);
  dummy.scale.set(radius, radius, radius);
  dummy.updateMatrix();
  if (index < CROWD_CAP + 16) mesh.setMatrixAt(index, dummy.matrix);
  return index + 1;
}
