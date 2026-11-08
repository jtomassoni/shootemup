import { destinationById, type Avatar } from "@/game/content";
import { drawHud } from "@/render/paint";
import { H, PLAYER_Y, W, type Enemy, type RunState } from "@/game/types";
import {
  ACESFilmicToneMapping,
  AdditiveBlending,
  AnimationAction,
  AnimationClip,
  AnimationMixer,
  BoxGeometry,
  Box3,
  BufferGeometry,
  CanvasTexture,
  CircleGeometry,
  Color,
  CylinderGeometry,
  ConeGeometry,
  DirectionalLight,
  DynamicDrawUsage,
  Float32BufferAttribute,
  Fog,
  Group,
  HalfFloatType,
  HemisphereLight,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PCFSoftShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  RepeatWrapping,
  DoubleSide,
  Scene,
  SkinnedMesh,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Texture,
  TextureLoader,
  TorusGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
  WebGLRenderTarget,
  BufferAttribute,
  type Material,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";

const SPAN_Z = 60;
/**
 * Pitched about 22 degrees below level, like the minigame ads: a strip of sky and
 * horizon at the top, the road converging toward it, the shooter near the bottom.
 */
const FOV = 50;
const CAMERA_Y = 7.5;
const CAMERA_Z = -2;
const LOOK_Y = 0;
const LOOK_Z = 16.6;
/** Pulls the shooter off the lens so the whole body stays in frame. */
const NEAR_Z = 6;
const LANE_TAN_H = Math.tan((FOV * Math.PI) / 360) * (W / H);
const LANE_FORWARD_LEN = Math.hypot(LOOK_Y - CAMERA_Y, LOOK_Z - CAMERA_Z);
const LANE_FORWARD_Y = (LOOK_Y - CAMERA_Y) / LANE_FORWARD_LEN;
const LANE_FORWARD_Z = (LOOK_Z - CAMERA_Z) / LANE_FORWARD_LEN;
const LANE_EYE_Y = CAMERA_Y;
const LANE_EYE_Z = CAMERA_Z;
const CROWD_CAP = 360;
/** Fitted avatars are about 1.7 units tall. This keeps them a person on the road, not a giant in the foreground. */
const PLAYER_SCALE = 0.55;
/** World units the road scrolls per second. Props, decals and ground all share it. */
const SCROLL_SPEED = 7;
const ROAD_FRACTION = 0.74;
const RAIL_FRACTION = 0.86;
const FAR_Z = 76;
/** Where the road geometry stops. Past the fog start, so the end never shows as an edge. */
const ROAD_END = 110;
const HORDE_FRAMES = 8;
const BLOOM_THRESHOLD = 1.25;

/** Every career maps onto one of the three Mixamo soldiers. */
const AVATAR_BODY: Record<string, string> = {
  nurse: "soldier-swat",
  engineer: "soldier-vanguard",
  driver: "soldier-maw",
  conductor: "soldier-swat",
  chef: "soldier-vanguard",
  pilot: "soldier-maw",
  ranger: "soldier-swat",
  crabber: "soldier-vanguard",
  cyclist: "soldier-maw",
  barista: "soldier-swat",
};
const SOLDIERS = ["soldier-swat", "soldier-vanguard", "soldier-maw"];

type ZombieKind = "shambler" | "crawler" | "brute" | "reacher";

/** Which Mixamo body and clip each zombie role uses. Heights are T-pose heights before personScale. */
const ZOMBIE_BODY: Record<ZombieKind, { slug: string; clip: string; height: number; rate: number }> = {
  shambler: { slug: "zombie-war", clip: "walk", height: 1.72, rate: 1 },
  reacher: { slug: "zombie-cop", clip: "walk", height: 1.78, rate: 1.1 },
  brute: { slug: "zombie-parasite", clip: "walk", height: 2.05, rate: 0.85 },
  crawler: { slug: "zombie-cop", clip: "crawl-run", height: 1.72, rate: 1.2 },
};
const ZOMBIE_KINDS: ZombieKind[] = ["shambler", "crawler", "brute", "reacher"];
const CHARACTER_SLUGS = [...new Set([...SOLDIERS, ...Object.values(ZOMBIE_BODY).map((body) => body.slug)])];
const HORDE_SLUGS = [...new Set(Object.values(ZOMBIE_BODY).map((body) => body.slug))];

type SpriteSpec = { file?: string; procedural?: ProceduralKind; height: number };

type ProceduralKind = "car" | "train" | "boat" | "case" | "hole" | "tires" | ZombieKind;

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
  model: Object3D | null;
  mixer: AnimationMixer | null;
  aim: AnimationAction | null;
  fire: AnimationAction | null;
  label: Sprite | null;
  shownHp: number;
  materials: MeshStandardMaterial[];
};

type PbrSet = { map: Texture; normalMap: Texture; roughnessMap: Texture };

const numberTextures = new Map<number, CanvasTexture>();
const dummy = new Object3D();
const projector = new Vector3();
const white = new Color("#ffffff");
const flashTint = new Color(2.4, 2.2, 1.9);
const shotTint = new Color("#ffffff");
const crateTint = new Color("#ffffff");
const CYAN = new Color(0.3, 1.7, 2.1);
const TRACER = new Color(2.6, 1.15, 0.3);

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
  // Camera right is world -X, so negate across: finger right, character right.
  return { x: -across * laneHalfWidth(z), z, depth };
}

/**
 * A strip from z0 to z1 whose half-width follows `half(z)`. UV v runs 0 at z0 to 1 at z1,
 * so every strip scrolls the same way with a positive offset.y.
 */
function ribbon(z0: number, z1: number, segments: number, half: (z: number) => number, y = 0.02) {
  const geometry = new BufferGeometry();
  const positions = new Float32Array((segments + 1) * 6);
  const uvs = new Float32Array((segments + 1) * 4);
  const indices: number[] = [];
  for (let i = 0; i <= segments; i += 1) {
    const t = i / segments;
    const z = z0 + (z1 - z0) * t;
    const h = half(z);
    const vertex = i * 2;
    positions.set([-h, y, z, h, y, z], vertex * 3);
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

function laneRibbon(z0: number, z1: number, segments: number, fraction = 1, y = 0.02) {
  return ribbon(z0, z1, segments, (z) => laneHalfWidth(z) * fraction, y);
}

function clipNamed(clips: AnimationClip[], names: string[]) {
  for (const name of names) {
    const found = AnimationClip.findByName(clips, name);
    if (found) return found;
  }
  return clips[0] ?? null;
}

function findSkinned(root: Object3D): SkinnedMesh[] {
  const found: SkinnedMesh[] = [];
  root.traverse((child) => {
    if ((child as SkinnedMesh).isSkinnedMesh) found.push(child as SkinnedMesh);
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

/** Freezes the current skeleton pose into plain geometry in the mesh's world space. */
function bakeSkinned(mesh: SkinnedMesh): BufferGeometry {
  mesh.skeleton.update();
  const geometry = mesh.geometry.clone();
  // The GLBs are quantized (Int16 positions, Uint16 uvs); expand to floats so we can
  // write skinned positions and so mergeGeometries sees one array type per attribute.
  for (const name of ["position", "normal", "uv"]) {
    const attr = geometry.attributes[name] as BufferAttribute | undefined;
    if (!attr || (attr.array instanceof Float32Array && !attr.normalized)) continue;
    const size = attr.itemSize;
    const out = new Float32Array(attr.count * size);
    for (let i = 0; i < attr.count; i += 1) {
      for (let c = 0; c < size; c += 1) out[i * size + c] = attr.getComponent(i, c);
    }
    geometry.setAttribute(name, new BufferAttribute(out, size));
  }
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
  geometry.applyMatrix4(mesh.matrixWorld);
  for (const name of Object.keys(geometry.attributes)) {
    if (name !== "position" && name !== "normal" && name !== "uv") geometry.deleteAttribute(name);
  }
  geometry.computeVertexNormals();
  stripMorphs(geometry);
  return geometry;
}

/** Non-indexed, with exactly position, normal, and uv, so any two parts can merge. */
function uniformForMerge(geometry: BufferGeometry): BufferGeometry {
  const flat = geometry.index ? geometry.toNonIndexed() : geometry;
  if (flat !== geometry) geometry.dispose();
  const count = flat.attributes.position?.count ?? 0;
  if (!flat.attributes.uv) flat.setAttribute("uv", new Float32BufferAttribute(new Float32Array(count * 2), 2));
  if (!flat.attributes.normal) flat.computeVertexNormals();
  for (const name of Object.keys(flat.attributes)) {
    if (name !== "position" && name !== "normal" && name !== "uv") flat.deleteAttribute(name);
  }
  stripMorphs(flat);
  return flat;
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
  ctx.font = "900 100px Impact, Avenir Next Condensed, Arial Narrow, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.lineWidth = 18;
  ctx.strokeStyle = "#ffffff";
  ctx.strokeText(String(value), 128, 68);
  ctx.fillStyle = "#e10600";
  ctx.fillText(String(value), 128, 68);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  numberTextures.set(value, texture);
  return texture;
}

function laneMarkings() {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 1024;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d");
  ctx.clearRect(0, 0, 256, 1024);
  ctx.fillStyle = "#f3e6c8";
  ctx.fillRect(6, 0, 7, 1024);
  ctx.fillRect(243, 0, 7, 1024);
  ctx.fillStyle = "#f0c419";
  for (let y = 0; y < 1024; y += 256) {
    ctx.fillRect(121, y + 40, 14, 120);
  }
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  for (let y = 128; y < 1024; y += 256) {
    ctx.fillRect(62, y, 8, 72);
    ctx.fillRect(186, y, 8, 72);
  }
  const texture = new CanvasTexture(canvas);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function skyTexture(top: string, bottom: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 4;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d");
  const gradient = ctx.createLinearGradient(0, 0, 0, 256);
  gradient.addColorStop(0, top);
  gradient.addColorStop(0.72, bottom);
  gradient.addColorStop(1, "#ffffff");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 4, 256);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

function colored(color: string, roughness = 0.7) {
  return new MeshStandardMaterial({ color, roughness, metalness: 0.04 });
}

function glowRing(radius: number) {
  const group = new Group();
  const ring = new Mesh(new TorusGeometry(radius, 0.032, 8, 48), new MeshBasicMaterial({ color: CYAN, toneMapped: false }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.04;
  const disc = new Mesh(
    new CircleGeometry(radius * 0.98, 48),
    new MeshBasicMaterial({ color: "#45d8ff", transparent: true, opacity: 0.1, blending: AdditiveBlending, depthWrite: false }),
  );
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = 0.035;
  group.add(ring, disc);
  return group;
}

function gunPaint(id: string) {
  if (id.includes("spread") || id.includes("spice")) return "#ff3b30";
  if (id.includes("train") || id.includes("horn")) return "#ffe14a";
  if (id.includes("pot")) return "#3ddc84";
  if (id.includes("mallet")) return "#ff7a18";
  return "#7cff6b";
}

function shadowed<T extends Object3D>(root: T): T {
  root.traverse((child) => {
    const mesh = child as Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = false;
  });
  return root;
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
    const lamp = new Mesh(new SphereGeometry(0.08, 8, 8), new MeshBasicMaterial({ color: new Color(3, 2.8, 2.2), toneMapped: false }));
    lamp.position.set(x, 0.5, 1.02);
    root.add(lamp);
  }
  return shadowed(root);
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
  const lamp = new Mesh(new SphereGeometry(0.1, 8, 8), new MeshBasicMaterial({ color: new Color(3, 2.8, 2), toneMapped: false }));
  lamp.position.set(0, 0.85, 1.22);
  root.add(lamp);
  return shadowed(root);
}

function buildBoat() {
  const root = new Group();
  const hull = new Mesh(new BoxGeometry(1.5, 0.38, 2.3), colored("#bc6c25"));
  hull.position.y = 0.28;
  const cabin = new Mesh(new BoxGeometry(0.7, 0.4, 0.7), colored("#f4f1de"));
  cabin.position.set(0, 0.62, -0.2);
  root.add(hull, cabin);
  return shadowed(root);
}

function buildCase() {
  const root = new Group();
  const box = new Mesh(new BoxGeometry(0.7, 0.85, 0.42), colored("#c1121f"));
  box.position.y = 0.48;
  const handle = new Mesh(new BoxGeometry(0.28, 0.08, 0.08), colored("#1c2430"));
  handle.position.y = 0.96;
  root.add(box, handle);
  return shadowed(root);
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

function buildTires(rubber: PbrSet | null) {
  const root = new Group();
  const material = rubber
    ? new MeshStandardMaterial({ map: rubber.map, normalMap: rubber.normalMap, roughnessMap: rubber.roughnessMap, color: "#c8c8c8", roughness: 1, metalness: 0 })
    : colored("#1a1c1e", 0.92);
  const rim = colored("#8d9398", 0.45);
  for (let i = 0; i < 3; i += 1) {
    const tire = new Mesh(new TorusGeometry(0.4, 0.16, 10, 22), material);
    tire.rotation.x = Math.PI / 2;
    tire.position.y = 0.18 + i * 0.3;
    tire.rotation.z = (i * Math.PI) / 7;
    const hub = new Mesh(new CylinderGeometry(0.16, 0.16, 0.1, 12), rim);
    hub.position.y = tire.position.y;
    root.add(tire, hub);
  }
  return shadowed(root);
}

/** Low-poly rifle with the stock at the origin and the barrel down +Z. */
function rifleGeometry() {
  const parts: BufferGeometry[] = [];
  const add = (w: number, h: number, d: number, x: number, y: number, z: number) => {
    const geometry = new BoxGeometry(w, h, d);
    geometry.translate(x, y, z);
    parts.push(geometry);
  };
  add(0.07, 0.11, 0.44, 0, 0, 0.12);
  add(0.04, 0.04, 0.5, 0, 0.035, 0.52);
  add(0.035, 0.035, 0.12, 0, 0.055, 0.78);
  add(0.06, 0.16, 0.08, 0, -0.1, -0.02);
  add(0.06, 0.1, 0.26, 0, -0.03, -0.26);
  add(0.05, 0.13, 0.06, 0, -0.09, 0.26);
  const merged = mergeGeometries(parts, false);
  parts.forEach((geometry) => geometry.dispose());
  if (!merged) throw new Error("rifle");
  return merged;
}

function outlineFrame(width: number, height: number, thickness = 0.05) {
  const group = new Group();
  const material = new MeshBasicMaterial({ color: CYAN, toneMapped: false });
  const top = new Mesh(new BoxGeometry(width, thickness, thickness), material);
  top.position.y = height / 2;
  const bottom = new Mesh(new BoxGeometry(width, thickness, thickness), material);
  bottom.position.y = -height / 2;
  const left = new Mesh(new BoxGeometry(thickness, height, thickness), material);
  left.position.x = -width / 2;
  const right = new Mesh(new BoxGeometry(thickness, height, thickness), material);
  right.position.x = width / 2;
  group.add(top, bottom, left, right);
  return group;
}

/** Scale and ground a model from its bind-pose bounds. Returns the applied transform for baking. */
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
  model.updateMatrixWorld(true);
}

function tuneCharacterMaterials(root: Object3D) {
  root.traverse((child) => {
    const mesh = child as Mesh;
    if (!mesh.isMesh) return;
    mesh.frustumCulled = false;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      const standard = material as MeshStandardMaterial;
      if (!standard.isMeshStandardMaterial) continue;
      standard.metalness = 0;
      standard.roughness = 0.82;
      standard.emissive = new Color(0, 0, 0);
      if (standard.map) standard.map.anisotropy = 4;
    }
  });
}

export class LaneStage {
  private renderer: WebGLRenderer;
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private scene = new Scene();
  private camera: PerspectiveCamera;
  private hemi: HemisphereLight;
  private sun: DirectionalLight;
  private templates = new Map<string, Template>();
  private characters = new Map<string, { scene: Object3D; clips: AnimationClip[] }>();
  private pools = new Map<string, Actor[]>();
  private active = new Map<number, Actor>();
  private player: Actor | null = null;
  private buddy: Actor | null = null;
  private avatarId = "";
  private scenery = new Group();
  private scrolling: Texture[] = [];
  private scrollRepeat: number[] = [];
  private bullets: InstancedMesh;
  private gates: Actor[] = [];
  private flash: Mesh;
  private ring: Group;
  private buddyRing: Group;
  private props: { object: Object3D; base: number; side: number; fraction: number; loop: number }[] = [];
  private zombieFrames = new Map<ZombieKind, InstancedMesh[]>();
  private textures = new Map<string, PbrSet>();
  private rifle = rifleGeometry();
  private viewW = 1;
  private viewH = 1;
  private dpr = 1;
  private ready = false;
  private frameEma = 1 / 60;
  private frameClock = 0;
  private lowPower = false;

  constructor(
    private canvas: HTMLCanvasElement,
    private hud: HTMLCanvasElement,
  ) {
    this.renderer = new WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: "high-performance" });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFSoftShadowMap;
    this.renderer.setClearColor("#9eb4a4", 1);
    this.camera = new PerspectiveCamera(FOV, 1, 0.25, 160);
    this.camera.position.set(0, CAMERA_Y, CAMERA_Z);
    this.camera.lookAt(0, LOOK_Y, LOOK_Z);

    this.hemi = new HemisphereLight("#dfeaf6", "#55604a", 0.6);
    this.scene.add(this.hemi);
    this.sun = new DirectionalLight("#fff1d6", 1.45);
    this.sun.position.set(-7, 24, 3);
    this.sun.target.position.set(0, 0, 16);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 70;
    this.sun.shadow.camera.left = -18;
    this.sun.shadow.camera.right = 18;
    this.sun.shadow.camera.top = 26;
    this.sun.shadow.camera.bottom = -22;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.03;
    this.scene.add(this.sun, this.sun.target);

    const target = new WebGLRenderTarget(1, 1, { type: HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(this.renderer, target);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new Vector2(1, 1), 0.42, 0.2, BLOOM_THRESHOLD);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    const bulletGeo = new BoxGeometry(1, 1, 1);
    const bulletMat = new MeshBasicMaterial({ color: "#ffffff", toneMapped: false });
    this.bullets = new InstancedMesh(bulletGeo, bulletMat, 240);
    this.bullets.count = 0;
    this.bullets.frustumCulled = false;
    this.bullets.instanceColor = new InstancedBufferAttribute(new Float32Array(240 * 3), 3);
    this.bullets.instanceMatrix.setUsage(DynamicDrawUsage);
    this.scene.add(this.bullets);

    this.flash = new Mesh(new SphereGeometry(0.075, 8, 8), new MeshBasicMaterial({ color: new Color(4.5, 2.6, 0.9), toneMapped: false }));
    this.flash.visible = false;
    this.scene.add(this.flash);
    this.ring = glowRing(0.62);
    this.buddyRing = glowRing(0.62);
    this.buddyRing.visible = false;
    this.scene.add(this.ring, this.buddyRing);
    this.scene.add(this.scenery);
  }

  async load() {
    const loader = new GLTFLoader();
    const textureLoader = new TextureLoader();
    const anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    const loadSet = async (name: string) => {
      const [map, normalMap, roughnessMap] = await Promise.all([
        textureLoader.loadAsync(`/textures/${name}-color.jpg`),
        textureLoader.loadAsync(`/textures/${name}-normal.jpg`),
        textureLoader.loadAsync(`/textures/${name}-rough.jpg`),
      ]);
      map.colorSpace = SRGBColorSpace;
      for (const texture of [map, normalMap, roughnessMap]) {
        texture.wrapS = RepeatWrapping;
        texture.wrapT = RepeatWrapping;
        texture.anisotropy = anisotropy;
      }
      this.textures.set(name, { map, normalMap, roughnessMap });
    };
    const files = new Set<string>(["Mountain001", "Hill001", "Bush001"]);
    for (const spec of Object.values(SPRITE)) {
      if (spec.file) files.add(spec.file);
    }
    await Promise.all([
      ...["concrete", "asphalt", "grass", "ground", "rubber", "metal"].map(loadSet),
      ...CHARACTER_SLUGS.map(async (slug) => {
        const gltf = await loader.loadAsync(`/models/characters/${slug}.glb`);
        tuneCharacterMaterials(gltf.scene);
        this.characters.set(slug, { scene: gltf.scene, clips: gltf.animations });
      }),
      ...HORDE_SLUGS.map(async (slug) => {
        const gltf = await loader.loadAsync(`/models/characters/${slug}.horde.glb`);
        tuneCharacterMaterials(gltf.scene);
        this.characters.set(`${slug}.horde`, { scene: gltf.scene, clips: gltf.animations });
      }),
      ...[...files].map(async (file) => {
        const gltf = await loader.loadAsync(`/models/${file}.glb`);
        const height = specHeight(file);
        let crowd: InstancedMesh | null = null;
        const mesh = findMesh(gltf.scene);
        if (mesh && file === "Rock001") {
          const geometry = mesh.geometry.clone();
          stripMorphs(geometry);
          fitHeight(geometry, height);
          const material = oneMaterial(mesh.material).clone();
          crowd = new InstancedMesh(geometry, material, CROWD_CAP);
          crowd.count = 0;
          crowd.frustumCulled = false;
          crowd.castShadow = true;
          crowd.instanceColor = new InstancedBufferAttribute(new Float32Array(CROWD_CAP * 3).fill(1), 3);
          crowd.instanceMatrix.setUsage(DynamicDrawUsage);
          this.scene.add(crowd);
        }
        this.templates.set(file, { scene: gltf.scene, clips: gltf.animations, crowd });
      }),
    ]);
    this.buildHorde();
    this.ready = true;
  }

  resize(viewW: number, viewH: number, dpr: number) {
    this.viewW = Math.max(1, viewW);
    this.viewH = Math.max(1, viewH);
    this.dpr = dpr;
    this.applyView();
    this.camera.aspect = this.viewW / this.viewH;
    this.camera.updateProjectionMatrix();
    this.hud.width = Math.floor(this.viewW * dpr);
    this.hud.height = Math.floor(this.viewH * dpr);
    this.hud.style.width = `${this.viewW}px`;
    this.hud.style.height = `${this.viewH}px`;
  }

  render(state: RunState, avatar: Avatar, showHitboxes: boolean, reducedMotion: boolean, dt: number) {
    if (!this.ready) return;
    this.watchFrameTime(dt);
    this.dress(state.destination);
    this.ensurePlayer(avatar);
    const scroll = reducedMotion ? 0 : state.time * SCROLL_SPEED;
    this.scrolling.forEach((texture, i) => {
      texture.offset.y = scroll / (this.scrollRepeat[i] ?? 1);
    });
    const shake = reducedMotion ? 0 : state.shake;
    this.camera.position.set(Math.sin(state.time * 40) * shake * 0.012, CAMERA_Y, CAMERA_Z);
    this.camera.lookAt(0, LOOK_Y, LOOK_Z);
    this.syncActors(state, avatar, dt, reducedMotion);
    this.syncCrowd(state);
    this.syncShots(state);
    this.composer.render();
    const ctx = this.hud.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.hud.width, this.hud.height);
    ctx.setTransform(this.hud.width / W, 0, 0, this.hud.height / H, 0, 0);
    drawHud(ctx, state, (x, y) => this.project(x, y));
    if (showHitboxes) this.paintHitboxes(ctx, state);
  }

  dispose() {
    this.composer.dispose();
    this.renderer.dispose();
  }

  /** Drops bloom, resolution and shadow size once if the device cannot hold the frame rate. */
  private watchFrameTime(dt: number) {
    if (this.lowPower || dt <= 0) return;
    this.frameClock += dt;
    if (this.frameClock < 3) return;
    this.frameEma += (dt - this.frameEma) * 0.08;
    if (this.frameEma > 1 / 42 && this.frameClock > 5) {
      this.lowPower = true;
      this.bloom.enabled = false;
      this.sun.shadow.mapSize.set(1024, 1024);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
      this.applyView();
    }
  }

  private applyView() {
    const ratio = this.lowPower ? 1 : Math.min(this.dpr, 1.5);
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(this.viewW, this.viewH, true);
    this.composer.setPixelRatio(ratio);
    this.composer.setSize(this.viewW, this.viewH);
  }

  private pbr(name: string, tint: string | Color, repeat: [number, number], scroll: boolean, lengthUnits: number) {
    const set = this.textures.get(name);
    if (!set) return new MeshStandardMaterial({ color: tint, roughness: 1, metalness: 0 });
    const maps = [set.map.clone(), set.normalMap.clone(), set.roughnessMap.clone()];
    for (const texture of maps) {
      texture.repeat.set(repeat[0], repeat[1]);
      texture.needsUpdate = true;
      if (scroll) {
        this.scrolling.push(texture);
        this.scrollRepeat.push(lengthUnits / repeat[1]);
      }
    }
    return new MeshStandardMaterial({
      map: maps[0],
      normalMap: maps[1],
      roughnessMap: maps[2],
      color: tint,
      roughness: 1,
      metalness: 0,
    });
  }

  private dress(destinationId: string) {
    if (this.scenery.userData.destination === destinationId) return;
    this.scenery.traverse((child) => {
      const mesh = child as Mesh;
      if (mesh.isMesh) mesh.geometry.dispose();
    });
    this.scenery.clear();
    this.props = [];
    this.scrolling = [];
    this.scrollRepeat = [];
    this.scenery.userData.destination = destinationId;
    const destination = destinationById(destinationId);
    const harbor = destinationId === "maryland";
    const [skyTop, skyBottom] = destination.sky;
    this.scene.background = new Color(skyBottom);
    // Fog ends past the mountains so they read as hazy shapes instead of vanishing.
    this.scene.fog = new Fog(skyBottom, 36, 112);
    this.renderer.setClearColor(skyBottom, 1);

    // Sky card behind the horizon.
    const sky = new Mesh(new PlaneGeometry(420, 120), new MeshBasicMaterial({ map: skyTexture(skyTop, skyBottom), fog: false, depthWrite: false }));
    sky.position.set(0, 40, 130);
    sky.rotation.y = Math.PI;
    this.scenery.add(sky);

    // Ground on both sides, then the road on top.
    const roadLength = ROAD_END - 0.4;
    const groundMat = this.pbr(harbor ? "ground" : "grass", harbor ? new Color(1.1, 1.05, 0.95) : new Color(1.35, 1.45, 1.1), [10, 22], true, roadLength + 12);
    const ground = new Mesh(ribbon(-0.5, ROAD_END + 12, 30, () => 60, -0.02), groundMat);
    ground.receiveShadow = true;
    ground.frustumCulled = false;
    this.scenery.add(ground);

    const roadMat = this.pbr(harbor ? "asphalt" : "concrete", harbor ? new Color(1.9, 1.95, 2.0) : new Color("#cdb995"), [2, 16], true, roadLength);
    const road = new Mesh(laneRibbon(0.4, ROAD_END, 28, ROAD_FRACTION, 0.015), roadMat);
    road.receiveShadow = true;
    road.frustumCulled = false;
    this.scenery.add(road);

    const markings = laneMarkings();
    markings.repeat.set(1, 9);
    this.scrolling.push(markings);
    this.scrollRepeat.push(roadLength / 9);
    const decalMat = new MeshStandardMaterial({ map: markings, color: "#d9d2c0", transparent: true, roughness: 0.95, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 });
    const decal = new Mesh(laneRibbon(0.4, ROAD_END, 28, ROAD_FRACTION, 0.03), decalMat);
    decal.receiveShadow = true;
    decal.frustumCulled = false;
    this.scenery.add(decal);

    // Shoulder curb where the road meets the grass.
    const curbMat = this.pbr("concrete", "#b9b2a4", [1, 40], true, roadLength);
    for (const side of [-1, 1]) {
      const curb = new Mesh(ribbon(0.4, ROAD_END, 28, () => 0.09, 0.05), curbMat);
      curb.position.x = 0;
      curb.frustumCulled = false;
      curb.receiveShadow = true;
      curb.castShadow = true;
      curb.userData.edge = side;
      // Place the curb along the lane edge by shearing it per vertex.
      const position = curb.geometry.attributes.position as BufferAttribute;
      for (let i = 0; i < position.count; i += 1) {
        const z = position.getZ(i);
        position.setX(i, position.getX(i) + side * laneHalfWidth(z) * (ROAD_FRACTION + 0.012));
      }
      position.needsUpdate = true;
      this.scenery.add(curb);
    }

    // Guard rails: two bars that follow the straight lane edge, posts scrolling between them.
    const railMat = new MeshStandardMaterial({ color: "#363b42", roughness: 0.5, metalness: 0.65 });
    for (const side of [-1, 1]) {
      const z0 = 0.5;
      const z1 = ROAD_END;
      const x0 = side * laneHalfWidth(z0) * RAIL_FRACTION;
      const x1 = side * laneHalfWidth(z1) * RAIL_FRACTION;
      const length = Math.hypot(x1 - x0, z1 - z0);
      const yaw = Math.atan2(x1 - x0, z1 - z0);
      for (const y of [0.58, 0.98]) {
        const bar = new Mesh(new BoxGeometry(0.1, 0.09, length), railMat);
        bar.position.set((x0 + x1) / 2, y, (z0 + z1) / 2);
        bar.rotation.y = yaw;
        bar.castShadow = true;
        bar.frustumCulled = false;
        this.scenery.add(bar);
      }
      for (let i = 0; i < 36; i += 1) {
        const post = new Mesh(new BoxGeometry(0.13, 1.08, 0.13), railMat);
        post.position.y = 0.54;
        post.castShadow = true;
        this.scenery.add(post);
        this.props.push({ object: post, base: 1 + i * 2.5, side, fraction: RAIL_FRACTION, loop: 90 });
      }
    }

    // Street lamps every so often.
    const lampMat = new MeshStandardMaterial({ color: "#2b3036", roughness: 0.5, metalness: 0.6 });
    const bulbMat = new MeshBasicMaterial({ color: new Color(1.7, 1.6, 1.3), toneMapped: false });
    for (let i = 0; i < 9; i += 1) {
      const lamp = new Group();
      const pole = new Mesh(new CylinderGeometry(0.05, 0.07, 4.2, 6), lampMat);
      pole.position.y = 2.1;
      const arm = new Mesh(new BoxGeometry(0.06, 0.06, 0.9), lampMat);
      arm.position.set(0, 4.15, 0.4);
      const bulb = new Mesh(new BoxGeometry(0.14, 0.05, 0.22), bulbMat);
      bulb.position.set(0, 4.1, 0.8);
      lamp.add(pole, arm, bulb);
      lamp.rotation.y = i % 2 === 0 ? Math.PI / 2 : -Math.PI / 2;
      shadowed(lamp);
      this.scenery.add(lamp);
      this.props.push({ object: lamp, base: 4 + i * 11, side: i % 2 === 0 ? -1 : 1, fraction: 1.02, loop: 99 });
    }

    if (harbor) {
      // Shipping containers and bollards stand in for the docks.
      const metal = this.textures.get("metal");
      const paints = ["#b23a2f", "#2f5d8a", "#c48a2b", "#4e6b4a", "#6d6f73"];
      for (let i = 0; i < 10; i += 1) {
        const mat = new MeshStandardMaterial({
          color: paints[i % paints.length],
          map: metal?.map ?? null,
          normalMap: metal?.normalMap ?? null,
          roughness: 0.75,
          metalness: 0.4,
        });
        const box = new Mesh(new BoxGeometry(2.4, 2.5, 6), mat);
        box.position.y = 1.25 + (i % 3 === 0 ? 2.5 : 0);
        box.castShadow = true;
        this.scenery.add(box);
        this.props.push({ object: box, base: 3 + i * 7.3, side: i % 2 === 0 ? -1 : 1, fraction: 1.35 + (i % 4) * 0.22, loop: 73 });
      }
      for (let i = 0; i < 8; i += 1) {
        const crane = new Group();
        const mast = new Mesh(new BoxGeometry(0.5, 12, 0.5), lampMat);
        mast.position.y = 6;
        const jib = new Mesh(new BoxGeometry(0.35, 0.35, 9), lampMat);
        jib.position.set(0, 11.8, 2.5);
        crane.add(mast, jib);
        this.scenery.add(crane);
        this.props.push({ object: crane, base: 10 + i * 17, side: i % 2 === 0 ? -1 : 1, fraction: 2.4, loop: 136 });
      }
    } else {
      // Pines behind the rail, hills and mountains on the horizon.
      const needles = [new MeshStandardMaterial({ color: "#3f7a3b", roughness: 0.95 }), new MeshStandardMaterial({ color: "#4f8a3e", roughness: 0.95 }), new MeshStandardMaterial({ color: "#36683a", roughness: 0.95 })];
      const trunkMat = new MeshStandardMaterial({ color: "#5a4030", roughness: 0.95 });
      for (let i = 0; i < 26; i += 1) {
        const tree = new Group();
        const h = 1.1 + ((i * 37) % 10) * 0.07;
        const needleMat = needles[i % needles.length]!;
        const trunk = new Mesh(new CylinderGeometry(0.08, 0.12, h * 0.34, 7), trunkMat);
        trunk.position.y = h * 0.17;
        for (const [radius, height, lift] of [[0.42, 0.42, 0.3], [0.34, 0.4, 0.52], [0.24, 0.38, 0.74]] as const) {
          const tier = new Mesh(new ConeGeometry(h * radius, h * height, 10), needleMat);
          tier.position.y = h * lift;
          tree.add(tier);
        }
        tree.add(trunk);
        tree.rotation.y = (i * 1.7) % Math.PI;
        shadowed(tree);
        this.scenery.add(tree);
        tree.userData.far = true;
        tree.userData.baseScale = 1;
        this.props.push({ object: tree, base: 2 + i * 2.9, side: i % 2 === 0 ? -1 : 1, fraction: 1.08 + ((i * 53) % 7) * 0.05, loop: 76 });
      }
      const bush = this.templates.get("Bush001");
      if (bush) {
        for (let i = 0; i < 14; i += 1) {
          const clone = bush.scene.clone();
          fitActor(clone, 0.5 + ((i * 7) % 5) * 0.08);
          shadowed(clone);
          clone.userData.far = true;
          clone.userData.baseScale = clone.scale.x;
          this.scenery.add(clone);
          this.props.push({ object: clone, base: 1.5 + i * 4.3, side: i % 2 === 0 ? 1 : -1, fraction: 0.96 + ((i * 11) % 5) * 0.05, loop: 60 });
        }
      }
      const mountain = this.templates.get("Mountain001");
      const hill = this.templates.get("Hill001");
      const horizon = [
        { template: mountain, x: -34, z: 84, height: 26 },
        { template: mountain, x: 30, z: 90, height: 30 },
        { template: hill, x: -12, z: 78, height: 9 },
        { template: hill, x: 14, z: 80, height: 11 },
        { template: mountain, x: 0, z: 98, height: 24 },
        { template: hill, x: -40, z: 72, height: 10 },
        { template: hill, x: 44, z: 76, height: 12 },
      ];
      for (const item of horizon) {
        if (!item.template) continue;
        const clone = item.template.scene.clone();
        fitActor(clone, item.height);
        clone.position.x += item.x;
        clone.position.z += item.z;
        clone.traverse((child) => {
          const mesh = child as Mesh;
          if (!mesh.isMesh) return;
          const material = oneMaterial(mesh.material).clone() as MeshStandardMaterial;
          if (material.color) material.color.lerp(new Color(skyBottom), 0.2);
          mesh.material = material;
        });
        this.scenery.add(clone);
      }
    }
    this.placeProps(0);
  }

  private placeProps(scroll: number) {
    for (const prop of this.props) {
      const travel = prop.base - scroll;
      const loop = ((travel % prop.loop) + prop.loop) % prop.loop;
      const z = loop - 2;
      prop.object.position.z = z;
      prop.object.position.x = prop.side * laneHalfWidth(z) * prop.fraction;
      if (prop.object.userData.far) {
        // Trees only live in the distance; they grow in past z=14 so nothing pops at the edge of the frame.
        const grow = Math.min(1, Math.max(0, (z - 14) / 8));
        prop.object.visible = grow > 0;
        const base = prop.object.userData.baseScale as number;
        prop.object.scale.setScalar(base * grow);
      } else {
        prop.object.visible = z > 1.2;
      }
    }
  }

  /** Bakes HORDE_FRAMES poses of each zombie body into instanced meshes for the crowd. */
  private buildHorde() {
    for (const kind of ZOMBIE_KINDS) {
      const body = ZOMBIE_BODY[kind];
      const template = this.characters.get(`${body.slug}.horde`);
      if (!template) continue;
      const clip = clipNamed(template.clips, [body.clip, "walk"]);
      if (!clip) continue;
      const preview = cloneSkeleton(template.scene);
      fitActor(preview, body.height);
      const mixer = new AnimationMixer(preview);
      const action = mixer.clipAction(clip);
      action.play();
      const skinnedMeshes = findSkinned(preview);
      const materials = skinnedMeshes.map((mesh) => {
        const material = oneMaterial(mesh.material).clone() as MeshStandardMaterial;
        material.emissive = new Color(0, 0, 0);
        return material;
      });
      const frames: InstancedMesh[] = [];
      for (let frame = 0; frame < HORDE_FRAMES; frame += 1) {
        mixer.setTime((clip.duration * frame) / HORDE_FRAMES);
        preview.updateMatrixWorld(true);
        // Mixamo bodies ship several skinned meshes that may not agree on indexing or uv
        // layout. Flatten them to the same shape or mergeGeometries returns null.
        const parts = skinnedMeshes.map((mesh) => uniformForMerge(bakeSkinned(mesh)));
        const merged = mergeGeometries(parts, true);
        parts.forEach((part) => part.dispose());
        if (!merged) {
          console.warn(`horde ${kind}: could not merge ${parts.length} meshes for frame ${frame}`);
          continue;
        }
        const mesh = new InstancedMesh(merged, materials.length === 1 ? materials[0]! : materials, CROWD_CAP);
        mesh.count = 0;
        mesh.frustumCulled = false;
        mesh.castShadow = true;
        mesh.instanceColor = new InstancedBufferAttribute(new Float32Array(CROWD_CAP * 3).fill(1), 3);
        mesh.instanceMatrix.setUsage(DynamicDrawUsage);
        this.scene.add(mesh);
        frames.push(mesh);
      }
      if (frames.length === 0) {
        console.warn(`horde ${kind}: no frames baked, crowd will not draw`);
        continue;
      }
      this.zombieFrames.set(kind, frames);
    }
  }

  private ensurePlayer(avatar: Avatar) {
    if (this.player && this.avatarId === avatar.id) return;
    if (this.player) this.scene.remove(this.player.root);
    const slug = AVATAR_BODY[avatar.id] ?? SOLDIERS[0]!;
    this.player = this.makeSoldier(slug);
    this.avatarId = avatar.id;
    if (this.player) this.scene.add(this.player.root);
  }

  private makeSoldier(slug: string): Actor | null {
    const actor = this.makeCharacter(slug, ["aim", "idle"], 1.72);
    if (!actor || !actor.model) return actor;
    const hand = actor.model.getObjectByName("mixamorigRightHand");
    if (hand) {
      const rifle = new Mesh(this.rifle, new MeshStandardMaterial({ color: "#1b1d21", roughness: 0.5, metalness: 0.6 }));
      // Hand bones are in the rig's centimetre space before the root scale.
      const inverse = 1 / Math.max(0.0001, actor.model.scale.x);
      rifle.scale.setScalar(inverse * 0.9);
      rifle.position.set(0.03 * inverse, -0.02 * inverse, 0.1 * inverse);
      rifle.rotation.set(-Math.PI / 2, 0, Math.PI / 2);
      rifle.castShadow = true;
      hand.add(rifle);
    }
    return actor;
  }

  private blendFire(actor: Actor, firing: boolean) {
    if (!actor.aim || !actor.fire) return;
    const fireWeight = firing ? 1 : 0;
    actor.fire.setEffectiveWeight(fireWeight);
    actor.aim.setEffectiveWeight(1 - fireWeight);
  }

  private makeGate(): Actor {
    const root = new Group();
    const tires = buildTires(this.textures.get("rubber") ?? null);
    tires.scale.setScalar(0.92);
    const gun = new Mesh(this.rifle, new MeshStandardMaterial({ color: "#1b1d21", roughness: 0.45, metalness: 0.45 }));
    // Stand the rifle on the plate, barrel up, facing the camera.
    gun.position.set(0, 1.28, 0.2);
    gun.rotation.set(-Math.PI / 2, 0, 0);
    gun.scale.setScalar(1.7);
    gun.castShadow = true;
    const board = new Mesh(
      new PlaneGeometry(0.95, 0.7),
      new MeshStandardMaterial({ color: "#f4f7fb", roughness: 0.55, metalness: 0.05, side: DoubleSide }),
    );
    board.position.set(0, 1.55, 0.12);
    const frame = outlineFrame(1.02, 0.78, 0.045);
    frame.position.set(0, 1.55, 0.13);
    const labelMaterial = new SpriteMaterial({ transparent: true, depthTest: false });
    const label = new Sprite(labelMaterial);
    label.position.set(0, 2.15, 0);
    label.scale.set(1.35, 0.66, 1);
    root.add(tires, gun, board, frame, label);
    return { root, model: gun, mixer: null, aim: null, fire: null, label, shownHp: -1, materials: [] };
  }

  private makeCharacter(slug: string, clipNames: string[], height: number): Actor | null {
    const template = this.characters.get(slug);
    if (!template) return null;
    const root = new Group();
    const model = cloneSkeleton(template.scene);
    const materials: MeshStandardMaterial[] = [];
    model.traverse((child) => {
      const mesh = child as Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.frustumCulled = false;
      const source = oneMaterial(mesh.material) as MeshStandardMaterial;
      const material = source.clone();
      material.emissive = new Color(0, 0, 0);
      mesh.material = material;
      materials.push(material);
    });
    fitActor(model, height);
    root.add(model);
    let mixer: AnimationMixer | null = null;
    let aim: AnimationAction | null = null;
    let fire: AnimationAction | null = null;
    const clip = clipNamed(template.clips, clipNames);
    if (clip) {
      mixer = new AnimationMixer(model);
      aim = mixer.clipAction(clip);
      aim.play();
      const fireClip = AnimationClip.findByName(template.clips, "fire");
      if (fireClip && fireClip !== clip) {
        fire = mixer.clipAction(fireClip);
        fire.setEffectiveWeight(0);
        fire.play();
      }
      mixer.update(Math.random() * clip.duration);
    }
    const labelMaterial = new SpriteMaterial({ transparent: true, depthTest: false });
    const label = new Sprite(labelMaterial);
    label.visible = false;
    label.position.y = height + 0.45;
    root.add(label);
    return { root, model, mixer, aim, fire, label, shownHp: -1, materials };
  }

  private borrow(key: string): Actor | null {
    const pool = this.pools.get(key);
    const reused = pool?.pop();
    if (reused) {
      reused.root.visible = true;
      this.scene.add(reused.root);
      return reused;
    }
    const kind = key.slice(5) as ProceduralKind;
    if (kind in ZOMBIE_BODY) {
      const body = ZOMBIE_BODY[kind as ZombieKind];
      return this.makeCharacter(body.slug, [body.clip, "walk"], body.height);
    }
    const root =
      kind === "car" ? buildCar()
      : kind === "train" ? buildTrain()
      : kind === "boat" ? buildBoat()
      : kind === "case" ? buildCase()
      : kind === "hole" ? buildHole()
      : buildTires(this.textures.get("rubber") ?? null);
    const labelMaterial = new SpriteMaterial({ transparent: true, depthTest: false });
    const label = new Sprite(labelMaterial);
    label.visible = false;
    label.position.y = 1.6;
    root.add(label);
    return { root, model: null, mixer: null, aim: null, fire: null, label, shownHp: -1, materials: [] };
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
      const playerScale = PLAYER_SCALE * 1.08;
      const kick = state.muzzle > 0 ? 0.05 : 0;
      this.player.root.position.set(point.x + Math.sin(state.aim) * kick, 0, point.z - Math.cos(state.aim) * kick);
      this.player.root.rotation.y = -state.aim;
      this.player.root.scale.setScalar(playerScale);
      this.blendFire(this.player, state.muzzle > 0);
      this.player.mixer?.update(step);
      this.ring.position.set(point.x, 0, point.z);
      this.ring.scale.setScalar(1.1);
      this.flash.visible = state.muzzle > 0;
      this.flash.position.set(
        point.x - Math.sin(state.aim) * 0.62,
        1.22 * playerScale,
        point.z + Math.cos(state.aim) * 0.62,
      );
      this.flash.scale.setScalar(0.8 + Math.random() * 0.6);
    }
    if (state.companion) {
      if (!this.buddy) {
        const own = AVATAR_BODY[avatar.id] ?? SOLDIERS[0]!;
        const slug = SOLDIERS[(SOLDIERS.indexOf(own) + 1) % SOLDIERS.length]!;
        this.buddy = this.makeSoldier(slug);
        if (this.buddy) this.scene.add(this.buddy.root);
      }
      if (this.buddy && this.player) {
        this.buddy.root.position.set(this.player.root.position.x - 0.5, 0, this.player.root.position.z + 0.3);
        this.buddy.root.rotation.y = 0;
        this.buddy.root.scale.setScalar(PLAYER_SCALE * 0.95);
        this.blendFire(this.buddy, state.muzzle > 0);
        this.buddy.mixer?.update(step);
        this.buddyRing.visible = true;
        this.buddyRing.position.set(this.buddy.root.position.x, 0, this.buddy.root.position.z);
        this.buddyRing.scale.setScalar(0.95);
      }
    } else if (this.buddy) {
      this.scene.remove(this.buddy.root);
      this.buddy = null;
      this.buddyRing.visible = false;
    } else {
      this.buddyRing.visible = false;
    }

    const seen = new Set<number>();
    for (const enemy of state.enemies) {
      if (!enemy.alive || isCrowd(enemy)) continue;
      seen.add(enemy.id);
      const spec = SPRITE[enemy.sprite] ?? SPRITE.shambler!;
      const key = `proc:${spec.procedural ?? "shambler"}`;
      let actor = this.active.get(enemy.id);
      if (!actor) {
        const created = this.borrow(key);
        if (!created) continue;
        created.root.userData.key = key;
        this.scene.add(created.root);
        this.active.set(enemy.id, created);
        actor = created;
      }
      const point = lanePoint(enemy.x, enemy.y);
      const scale = bodyScale(enemy) * personScale(enemy);
      actor.root.visible = true;
      actor.root.position.set(point.x, 0, point.z);
      actor.root.rotation.y = enemy.sprite === "pothole" ? 0 : Math.PI + enemy.vx * 0.02;
      actor.root.scale.setScalar(scale);
      if (!reducedMotion && actor.mixer) {
        const rate = ZOMBIE_BODY[(spec.procedural ?? "shambler") as ZombieKind]?.rate ?? 1;
        actor.mixer.update(dt * rate * (enemy.mode === "dash" ? 1.8 : 1));
      }
      const flash = enemy.flash > 0 ? 1 : 0;
      for (const material of actor.materials) {
        material.emissive.setRGB(flash * 1.4, flash * 1.25, flash * 1.1);
      }
      this.label(actor, enemy, scale);
    }
    for (const [id, actor] of this.active) {
      if (seen.has(id)) continue;
      this.active.delete(id);
      this.release(actor);
    }
    this.placeProps(reducedMotion ? 0 : state.time * SCROLL_SPEED);
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
    const width = stack ? 1.9 : big ? 1.5 : 0.7;
    const height = stack ? 0.95 : big ? 0.75 : 0.35;
    actor.label.scale.set(width / scale, height / scale, 1);
    actor.label.position.y = stack ? 1.55 : big ? 2.45 : 1.95;
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
    const stamp = (mesh: InstancedMesh, list: Enemy[]) => {
      const count = Math.min(list.length, CROWD_CAP);
      mesh.count = count;
      for (let i = 0; i < count; i += 1) {
        const enemy = list[i]!;
        const point = lanePoint(enemy.x, enemy.y);
        dummy.position.set(point.x, 0, point.z);
        dummy.rotation.set(0, Math.PI + enemy.vx * 0.02, 0);
        dummy.scale.setScalar(personScale(enemy));
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        mesh.setColorAt(i, enemy.flash > 0 ? flashTint : white);
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    };
    for (const [kind, frames] of this.zombieFrames) {
      if (frames.length === 0) continue;
      const list = buckets.get(kind) ?? [];
      const bins = frames.map(() => [] as Enemy[]);
      const rate = (ZOMBIE_BODY[kind]?.rate ?? 1) * 9;
      for (const enemy of list) {
        const raw = Math.floor((state.time * rate + enemy.id * 1.37) % frames.length);
        const frame = Number.isFinite(raw) ? Math.min(frames.length - 1, Math.max(0, raw)) : 0;
        bins[frame]!.push(enemy);
      }
      frames.forEach((mesh, frame) => stamp(mesh, bins[frame]!));
    }
    for (const [file, template] of this.templates) {
      const mesh = template.crowd;
      if (!mesh) continue;
      stamp(mesh, buckets.get(file) ?? []);
    }
  }

  private syncShots(state: RunState) {
    const shots = state.bullets.filter((bullet) => bullet.alive);
    const count = Math.min(shots.length, 240);
    this.bullets.count = count;
    for (let i = 0; i < count; i += 1) {
      const bullet = shots[i]!;
      const ahead = lanePoint(bullet.x, bullet.y);
      const tail = 0.03;
      const behind = lanePoint(bullet.x - bullet.vx * tail, bullet.y - bullet.vy * tail);
      const midX = (ahead.x + behind.x) / 2;
      const midZ = (ahead.z + behind.z) / 2;
      const length = Math.hypot(ahead.x - behind.x, ahead.z - behind.z);
      const playerShot = bullet.from === "player";
      const thick = playerShot ? (bullet.kind === "pellet" ? 0.06 : 0.085) : 0.11;
      dummy.position.set(midX, playerShot ? 0.95 : 0.75, midZ);
      dummy.scale.set(1, 1, 1);
      dummy.rotation.set(0, 0, 0);
      dummy.lookAt(ahead.x, dummy.position.y, ahead.z);
      dummy.scale.set(thick, thick, Math.max(playerShot ? 0.2 : 0.18, length));
      dummy.updateMatrix();
      this.bullets.setMatrixAt(i, dummy.matrix);
      if (playerShot) shotTint.copy(TRACER);
      else shotTint.set(bullet.color).multiplyScalar(2.4);
      this.bullets.setColorAt(i, shotTint);
    }
    this.bullets.instanceMatrix.needsUpdate = true;
    if (this.bullets.instanceColor) this.bullets.instanceColor.needsUpdate = true;

    const crates = state.crates.filter((crate) => crate.alive);
    while (this.gates.length < crates.length) {
      const gate = this.makeGate();
      this.scene.add(gate.root);
      this.gates.push(gate);
    }
    for (let i = 0; i < this.gates.length; i += 1) {
      const gate = this.gates[i]!;
      const crate = crates[i];
      if (!crate) {
        gate.root.visible = false;
        continue;
      }
      const point = lanePoint(crate.x, crate.y);
      gate.root.visible = true;
      gate.root.position.set(point.x, 0, point.z);
      gate.root.rotation.y = Math.sin(state.time * 1.4 + crate.id) * 0.08;
      if (gate.model) {
        crateTint.set(crate.offer.type === "companion" ? "#3ec6ff" : gunPaint(crate.offer.weaponId));
        const material = oneMaterial((gate.model as Mesh).material) as MeshStandardMaterial;
        if (material.color) material.color.copy(crateTint);
      }
      const hits = Math.max(0, Math.ceil(crate.hitsLeft));
      if (gate.label && gate.shownHp !== hits) {
        gate.shownHp = hits;
        gate.label.material.map = numberTexture(hits);
        gate.label.material.needsUpdate = true;
        gate.label.visible = true;
      }
    }
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
  if (file.startsWith("Mountain") || file.startsWith("Hill") || file.startsWith("Bush")) return 1;
  return 1.72;
}

function isCrowd(enemy: Enemy) {
  return enemy.archetype.startsWith("herd-") || enemy.sprite === "hail";
}

function personScale(enemy: Enemy) {
  const kind = SPRITE[enemy.sprite]?.procedural;
  if (kind === "shambler" || kind === "crawler" || kind === "brute" || kind === "reacher") return 0.62;
  return 1;
}

function bodyScale(enemy: Enemy) {
  if (enemy.kind === "boss") return 2.1;
  if (enemy.kind === "miniboss") return 1.5;
  if (enemy.sprite === "brute" && enemy.maxHp >= 80) return 1.7;
  if (enemy.sprite === "tires") return 0.92;
  if (enemy.sprite === "train" || enemy.sprite === "skiff") return 1.25;
  if (enemy.sprite === "car" || enemy.sprite === "driver") return 1.05;
  return 1;
}
