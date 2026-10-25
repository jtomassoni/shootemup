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
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
  type BufferAttribute,
  type BufferGeometry,
  type Material,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";

const SPAN_X = 8.8;
const SPAN_Z = 46;
const CROWD_CAP = 360;

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

type SpriteSpec = { file?: string; procedural?: ProceduralKind; height: number };

type ProceduralKind = "car" | "train" | "boat" | "case" | "hole";

const SPRITE: Record<string, SpriteSpec> = {
  goat: { file: "Goat", height: 1.15 },
  "goat-boss": { file: "Goat", height: 1.15 },
  ram: { file: "HighlandCow", height: 1.45 },
  elk: { file: "Doe", height: 1.55 },
  "elk-boss": { file: "Eland", height: 1.7 },
  hare: { file: "Hare", height: 0.82 },
  lamb: { file: "Lamb", height: 0.95 },
  boar: { file: "Boar", height: 1.15 },
  gull: { file: "Seagull", height: 0.78 },
  "gull-boss": { file: "Seagull", height: 0.78 },
  crab: { file: "Scorpion", height: 0.72 },
  "crab-boss": { file: "Scorpion", height: 0.72 },
  hail: { file: "Rock001", height: 0.42 },
  cart: { file: "Cashier", height: 1.7 },
  shaker: { file: "FoodCourier", height: 1.7 },
  "hole-boss": { file: "HighlandCow", height: 1.45 },
  driver: { procedural: "car", height: 1 },
  car: { procedural: "car", height: 1 },
  train: { procedural: "train", height: 1 },
  skiff: { procedural: "boat", height: 1 },
  luggage: { procedural: "case", height: 1 },
  pothole: { procedural: "hole", height: 1 },
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

function lanePoint(x: number, y: number) {
  const across = (x - W / 2) / (W / 2);
  const depth = Math.max(-0.05, Math.min(1.08, (PLAYER_Y - y) / (PLAYER_Y + 70)));
  return { x: across * (SPAN_X / 2), z: depth * SPAN_Z, depth };
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
  return buildHole();
}

function roadTexture(asphalt: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d");
  ctx.fillStyle = asphalt;
  ctx.fillRect(0, 0, 128, 512);
  for (let i = 0; i < 1600; i += 1) {
    ctx.fillStyle = i % 2 === 0 ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.07)";
    ctx.fillRect((i * 47) % 128, (i * 19) % 512, 2, 2);
  }
  ctx.fillStyle = "#fff4cc";
  for (let y = 20; y < 512; y += 78) ctx.fillRect(60, y, 8, 34);
  ctx.fillStyle = "#f7f4ee";
  ctx.fillRect(6, 0, 3, 512);
  ctx.fillRect(119, 0, 3, 512);
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
  private props: { object: Object3D; base: number; side: number }[] = [];
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
    this.renderer.setClearColor("#8fd3ff", 1);
    this.camera = new PerspectiveCamera(46, 1, 0.25, 160);
    this.camera.position.set(0, 3.2, -5.6);
    this.camera.lookAt(0, 1.0, 14);
    this.hemi = new HemisphereLight("#f3fbff", "#6d8f55", 1);
    this.scene.add(this.hemi);
    const sun = new DirectionalLight("#fff6df", 1.35);
    sun.position.set(-6, 12, 4);
    this.scene.add(sun);

    const shadowGeo = new CircleGeometry(0.45, 14);
    const shadowMat = new MeshBasicMaterial({ color: "#12160f", transparent: true, opacity: 0.28, depthWrite: false });
    this.shadows = new InstancedMesh(shadowGeo, shadowMat, CROWD_CAP + 16);
    this.shadows.count = 0;
    this.shadows.frustumCulled = false;
    this.shadows.instanceMatrix.setUsage(DynamicDrawUsage);
    this.scene.add(this.shadows);

    const bulletGeo = new SphereGeometry(0.09, 6, 6);
    const bulletMat = new MeshBasicMaterial({ color: "#ffffff" });
    this.bullets = new InstancedMesh(bulletGeo, bulletMat, 240);
    this.bullets.count = 0;
    this.bullets.frustumCulled = false;
    this.bullets.instanceColor = new InstancedBufferAttribute(new Float32Array(240 * 3), 3);
    this.bullets.instanceMatrix.setUsage(DynamicDrawUsage);
    this.scene.add(this.bullets);

    const crateGeo = new BoxGeometry(0.62, 0.5, 0.62);
    const crateMat = new MeshStandardMaterial({ color: "#f4f1de", roughness: 0.6 });
    this.crates = new InstancedMesh(crateGeo, crateMat, 8);
    this.crates.count = 0;
    this.crates.frustumCulled = false;
    this.crates.instanceColor = new InstancedBufferAttribute(new Float32Array(8 * 3), 3);
    this.scene.add(this.crates);

    this.flash = new Mesh(new SphereGeometry(0.16, 8, 8), new MeshBasicMaterial({ color: "#fff6c2" }));
    this.flash.visible = false;
    this.scene.add(this.flash);
    this.ring = new Mesh(
      new CircleGeometry(0.55, 24),
      new MeshBasicMaterial({ color: "#7ee7ff", transparent: true, opacity: 0.55, depthWrite: false }),
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.scene.add(this.ring);
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
    this.camera.position.set(Math.sin(state.time * 40) * shake * 0.012, 3.2, -5.6);
    this.camera.lookAt(0, 1.0, 14);
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
    const harbor = destinationId === "maryland";
    this.scene.background = new Color(destination.sky[0]);
    this.scene.fog = new Fog(destination.sky[1], 28, 72);
    this.renderer.setClearColor(destination.sky[0], 1);
    // Every vertex stays in front of the camera. A plane that straddles the
    // camera makes fog interpolation paint the whole lane the sky color.
    const groundMat = new MeshBasicMaterial({ color: harbor ? "#6ea4b8" : "#6f9a45", side: DoubleSide });
    groundMat.fog = false;
    const ground = new Mesh(new PlaneGeometry(36, 62, 1, 12), groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, -0.06, 30);
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
    const road = new Mesh(new PlaneGeometry(SPAN_X, 54, 1, 12), roadMat);
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, 0.01, 28);
    road.frustumCulled = false;
    this.scenery.add(road);
    for (const side of [-1, 1]) {
      const rail = new Mesh(new BoxGeometry(0.12, 0.55, 52), colored(harbor ? "#d7dde2" : "#2f3a33"));
      rail.position.set(side * (SPAN_X / 2 + 0.15), 0.32, 28);
      this.scenery.add(rail);
    }
    this.plant("Mountain001", -7.5, 34, 7);
    this.plant("Mountain001", 6.2, 38, 8.5);
    this.plant("Hill001", -6.4, 26, 2.4);
    this.plant("Hill001", 6.8, 24, 2);
    for (let i = 0; i < (harbor ? 6 : 12); i += 1) {
      const side = i % 2 === 0 ? -1 : 1;
      const prop = this.plant(i % 3 === 0 ? "Bush001" : "Grass003", side * 5.4, 0, i % 3 === 0 ? 0.7 : 0.4);
      if (prop) this.props.push({ object: prop, base: 6 + i * 4.5, side });
    }
  }

  private plant(file: string, x: number, z: number, height: number) {
    const template = this.templates.get(file);
    if (!template) return null;
    const clone = cloneSkeleton(template.scene);
    fitActor(clone, height);
    clone.position.x += x;
    clone.position.z += z;
    this.scenery.add(clone);
    return clone;
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
      this.player.root.position.set(point.x, 0, point.z);
      this.player.root.rotation.y = state.lean * -0.35;
      this.player.root.scale.setScalar(this.style === "chunky" ? 1.08 : 1);
      this.player.mixer?.update(step);
      this.ring.position.set(point.x, 0.04, point.z);
      this.flash.visible = state.muzzle > 0;
      this.flash.position.set(point.x, 1.15, point.z + 0.8);
    }
    if (state.companion) {
      if (!this.buddy) {
        this.buddy = this.makeActor(AVATAR_FILE[avatar.id] ?? "WardNurse", ["Run", "Walk"], "#b8f4ff");
        if (this.buddy) this.scene.add(this.buddy.root);
      }
      if (this.buddy && this.player) {
        this.buddy.root.position.set(this.player.root.position.x + 0.7, 0, this.player.root.position.z + 0.35);
        this.buddy.root.rotation.y = 0;
        this.buddy.root.scale.setScalar(0.82);
        this.buddy.mixer?.update(step);
      }
    } else if (this.buddy) {
      this.scene.remove(this.buddy.root);
      this.buddy = null;
    }

    const seen = new Set<number>();
    let shadow = 0;
    if (this.player) shadow = stampShadow(this.shadows, shadow, this.player.root.position.x, this.player.root.position.z, 0.55);
    for (const enemy of state.enemies) {
      if (!enemy.alive || isCrowd(enemy)) continue;
      seen.add(enemy.id);
      const spec = SPRITE[enemy.sprite] ?? SPRITE.goat!;
      const key = spec.procedural ? `proc:${spec.procedural}` : spec.file ?? "Goat";
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
      const scale = bodyScale(enemy) * (this.style === "chunky" ? 1.06 : 1);
      actor.root.visible = true;
      actor.root.position.set(point.x, enemy.sprite === "pothole" ? 0 : Math.sin(state.time * 8 + enemy.id) * 0.03, point.z);
      actor.root.rotation.y = enemy.sprite === "pothole" || enemy.sprite === "hole-boss" ? 0 : Math.PI + enemy.vx * 0.02;
      actor.root.scale.setScalar(enemy.flash > 0 ? scale * 1.06 : scale);
      if (!reducedMotion) actor.mixer?.update(dt);
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
    const big = enemy.kind === "boss" || enemy.kind === "miniboss";
    actor.label.scale.set(big ? 2.4 / scale : 1.5 / scale, big ? 1.15 / scale : 0.72 / scale, 1);
    actor.label.position.y = (big ? 2.3 : 1.7);
  }

  private syncCrowd(state: RunState) {
    const buckets = new Map<string, Enemy[]>();
    for (const enemy of state.enemies) {
      if (!enemy.alive || !isCrowd(enemy)) continue;
      const spec = SPRITE[enemy.sprite];
      const file = spec?.file;
      if (!file) continue;
      const list = buckets.get(file) ?? [];
      list.push(enemy);
      buckets.set(file, list);
    }
    let shadow = this.shadows.count;
    for (const [file, template] of this.templates) {
      const mesh = template.crowd;
      if (!mesh) continue;
      const list = buckets.get(file) ?? [];
      const count = Math.min(list.length, CROWD_CAP);
      mesh.count = count;
      for (let i = 0; i < count; i += 1) {
        const enemy = list[i]!;
        const point = lanePoint(enemy.x, enemy.y);
        const bob = Math.sin(state.time * 10 + enemy.id * 1.7) * 0.05;
        dummy.position.set(point.x, bob, point.z);
        dummy.rotation.set(0, Math.PI, 0);
        dummy.scale.setScalar(enemy.flash > 0 ? 1.08 : 1);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        mesh.setColorAt(i, enemy.flash > 0 ? flashTint : white);
        shadow = stampShadow(this.shadows, shadow, point.x, point.z, 0.34);
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
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
      const point = lanePoint(bullet.x, bullet.y);
      const heavy = bullet.kind === "train" || bullet.kind === "mallet" || bullet.kind === "horn";
      dummy.position.set(point.x, heavy ? 0.7 : 0.95, point.z);
      dummy.rotation.set(0, 0, bullet.age * 6);
      const scale = heavy ? 2.4 : bullet.kind === "pellet" ? 0.7 : 1;
      dummy.scale.set(scale, scale, bullet.kind === "train" ? scale * 1.8 : scale);
      dummy.updateMatrix();
      this.bullets.setMatrixAt(i, dummy.matrix);
      shotTint.set(bullet.color);
      this.bullets.setColorAt(i, shotTint);
    }
    this.bullets.instanceMatrix.needsUpdate = true;
    if (this.bullets.instanceColor) this.bullets.instanceColor.needsUpdate = true;

    const crates = state.crates.filter((crate) => crate.alive);
    this.crates.count = Math.min(crates.length, 8);
    for (let i = 0; i < this.crates.count; i += 1) {
      const crate = crates[i]!;
      const point = lanePoint(crate.x, crate.y);
      dummy.position.set(point.x, 0.55 + Math.sin(state.time * 4 + crate.id) * 0.06, point.z);
      dummy.rotation.set(0, state.time * 0.8 + crate.id, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      this.crates.setMatrixAt(i, dummy.matrix);
      crateTint.set(crate.offer.type === "companion" ? "#7bdff2" : "#f4d35e");
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

function bodyScale(enemy: Enemy) {
  if (enemy.kind === "boss") return 1.9;
  if (enemy.kind === "miniboss") return 1.45;
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
