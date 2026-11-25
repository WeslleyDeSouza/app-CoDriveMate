import { MapSurfaceFactory } from '@domains/navigation';
import {
  ACESFilmicToneMapping,
  Box3,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  Fog,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  Material,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PCFShadowMap,
  PMREMGenerator,
  PerspectiveCamera,
  PlaneGeometry,
  Quaternion,
  Scene,
  Texture,
  Vector3,
  WebGLRenderTarget,
  WebGLRenderer,
} from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MAPBOX_FOV, backdropCamera, backdropPosition, backdropView } from '../domain/backdrop';
import { CameraMode, activeMode, cameraView, turnTowards } from '../domain/camera';
import {
  LonLat,
  METRES_PER_DEGREE_LAT,
  hasAerialImages,
  metresPerDegreeLon,
} from '../domain/environment';
import {
  AerialSource,
  SceneAppearance,
  SceneEnvironment,
  SceneEvents,
  ScenePose,
  SceneQuality,
  SceneRenderer,
  SceneWorld,
  TerrainSource,
  TilesetSource,
} from '../domain/ports';
import { SunPosition, lightPreset, sunPosition } from '../domain/sun';
import { Flat, MeshData, ribbon } from '../domain/world-geometry';
import { MapboxBackdrop } from './mapbox-backdrop';
import { SceneGround } from './scene-ground';
import { asphaltMaterial, facadeMaterial, sceneUniforms, towardsCamera } from './scene-materials';
import { SceneSky } from './scene-sky';
import {
  SceneTileset,
  castShadows,
  googleTileset,
  swissTileset,
  useMaterial,
} from './scene-tilesets';
import { SWISS_BUILDINGS, SWISS_TREES } from './swisstopo-3d.source';

const RAD = Math.PI / 180;
const FRAME_MS = 32; // about 30 frames per second
const WHEEL_RADIUS_M = 0.31;
const CAR_LENGTH_M = 4.28;
const GROUND_CHECK_MS = 700;
const SLOW_CHECK_MS = 30000;
/** Further away from the origin, positions would become inexact. */
const REBASE_M = 1500;
const ROUTE_RADIUS_M = 2500;
/** Further jumps are a new place, not movement. */
const JUMP_M = 60;
const MAX_EXTRAPOLATION_S = 1.5;
const SLOW_FRAME_MS = 45;
/** Height Google's surface is looked for around, before it is measured. */
const GOOGLE_BASE_M = 450;
/** On slopes the flat layers need more distance, or they cut through each other. */
const LIFT: Record<string, number> = { sidewalks: -0.06, lines: 0.01, markings: 0.01 };
/** Where the sun is taken from while the position is unknown. */
const SOMEWHERE: LonLat = [8.54, 47.38];

const QUALITY: Record<
  SceneQuality,
  { pixelRatio: number; shadowMap: number; errorTarget: number; far: number }
> = {
  low: { pixelRatio: 1, shadowMap: 0, errorTarget: 32, far: 350 },
  normal: { pixelRatio: 1.5, shadowMap: 1024, errorTarget: 16, far: 700 },
  high: { pixelRatio: 2, shadowMap: 2048, errorTarget: 8, far: 900 },
};

export interface SceneSources {
  readonly aerial: AerialSource;
  readonly terrain: TerrainSource;
  readonly tilesets: TilesetSource;
  readonly maps: MapSurfaceFactory;
}

/** The car in its surroundings, drawn with three.js. The world turns around the car. */
export class ThreeScene implements SceneRenderer {
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(36, 1, 0.3, 1500);
  private readonly world = new Group();
  /** Moved against the car; everything in it is relative to `origin`. */
  private readonly inner = new Group();
  private readonly fallbackRoad = new Group();
  private readonly fallbackDashes: Object3D[] = [];
  private readonly car = new Group();
  private readonly sky = new SceneSky(this.car);
  private readonly ground: SceneGround;
  private readonly uniforms = sceneUniforms();

  private readonly materials = {
    road: asphaltMaterial(this.uniforms),
    line: new MeshStandardMaterial({ roughness: 0.8 }),
    marking: new MeshStandardMaterial({ roughness: 0.8, vertexColors: true }),
    route: new MeshBasicMaterial({
      color: 0x4c8dff,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
    }),
    building: facadeMaterial(this.uniforms, false),
    swissBuilding: facadeMaterial(this.uniforms, true),
    sidewalk: new MeshStandardMaterial({ roughness: 1 }),
    trunk: new MeshStandardMaterial({ roughness: 1 }),
    crown: new MeshStandardMaterial({ roughness: 0.95, flatShading: true }),
    stage: new MeshStandardMaterial({ roughness: 0.95 }),
    stageLine: new MeshBasicMaterial(),
  };
  private readonly trunkShape = new CylinderGeometry(0.12, 0.2, 1, 5);
  private readonly crownShape = new IcosahedronGeometry(1, 0);
  private lights?: PMREMGenerator;
  private studio?: WebGLRenderTarget;
  private skyLight?: WebGLRenderTarget;
  private skyLightFor = '';
  private readonly fog = new Fog(0x0b0c10, 14, 48);

  private wheels: Object3D[] = [];
  private paint: MeshStandardMaterial[] = [];
  private tail?: MeshStandardMaterial;

  private pose: ScenePose = { at: null, heading: 0, speedKmh: 0, extrapolate: false };
  private poseTime = 0;
  private appearance?: SceneAppearance;
  private environment: SceneEnvironment | null = null;
  private environmentGroup?: Group;
  private routePoints: readonly LonLat[] | null = null;
  private routeMesh?: Mesh;
  private mode: CameraMode = 'auto';
  private origin: LonLat | null = null;

  private swissBuildings?: SceneTileset;
  private swissTrees?: SceneTileset;
  private google?: SceneTileset;
  private googleKey = '';
  private backdrop?: MapboxBackdrop;
  /** Set from opening the backdrop until it is closed. */
  private backdropToken?: object;
  private attribution = '';

  private readonly smooth: [number, number] = [0, 0];
  private smoothHeading = 0;
  private groundY = 0;
  private placed = false;
  private lastGround = 0;
  private lastSlowCheck = -Infinity;
  private sunNow: SunPosition = { altitude: 40, azimuth: 160 };

  private running = false;
  private destroyed = false;
  private frame = 0;
  private lastFrame = 0;
  private slowFrames = 0;
  private slowdown = 1;
  private lastSpeed = 0;
  private steer = 0;
  private brake = 0;
  private stoppedS = 0;
  private orbitAngle = 0.6;
  private readonly cameraAt = new Vector3(0, 2.7, 8.8);
  private readonly cameraTarget = new Vector3(0, 0.8, -2);
  private readonly wanted = new Vector3();
  private readonly resizer = new ResizeObserver(() => this.resize());
  private readonly calm =
    globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;

  private constructor(
    private readonly renderer: WebGLRenderer,
    private readonly container: HTMLElement,
    private readonly sources: SceneSources,
    private readonly events: SceneEvents,
  ) {
    this.ground = new SceneGround(sources.aerial, sources.terrain, () => this.drapeAll());
  }

  static async create(
    container: HTMLElement,
    sources: SceneSources,
    events: SceneEvents,
  ): Promise<ThreeScene> {
    const renderer = new WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'low-power',
    });
    const scene = new ThreeScene(renderer, container, sources, events);
    renderer.domElement.addEventListener('webglcontextlost', () => {
      if (!scene.destroyed) events.onLost();
    });
    try {
      scene.build();
      await scene.loadCar();
    } catch (error) {
      scene.destroy();
      throw error;
    }
    return scene;
  }

  setPose(pose: ScenePose): void {
    if (pose.at !== this.pose.at) this.poseTime = performance.now();
    this.pose = pose;
    if (pose.at && !this.origin) this.rebase(pose.at);
  }

  setEnvironment(environment: SceneEnvironment | null): void {
    this.environment = environment;
    if (this.environmentGroup) {
      this.inner.remove(this.environmentGroup);
      this.environmentGroup.traverse((object) => {
        if (object instanceof InstancedMesh) object.dispose();
        else if (object instanceof Mesh) object.geometry.dispose();
      });
      this.environmentGroup = undefined;
    }
    if (!environment) return;
    const { geometry } = environment;
    const m = this.materials;
    const group = new Group();
    const add = (name: string, data: MeshData, material: Material, order: number) => {
      if (!data.index.length) return;
      const mesh = new Mesh(toGeometry(data), material);
      mesh.name = name;
      mesh.userData['lift'] = LIFT[name] ?? 0;
      mesh.renderOrder = order;
      mesh.receiveShadow = true;
      mesh.castShadow = name === 'buildings';
      group.add(mesh);
    };
    add('sidewalks', geometry.sidewalks, m.sidewalk, 4);
    add('roads', geometry.roads, m.road, 5);
    add('lines', geometry.lines, m.line, 6);
    add('markings', geometry.markings, m.marking, 6);
    add('buildings', geometry.buildings, m.building, 7);
    const trees = new Group();
    trees.name = 'trees';
    group.add(trees);
    this.environmentGroup = group;
    this.inner.add(group);
    this.placeEnvironment();
    this.applyAppearance();
  }

  setRoute(points: readonly LonLat[] | null): void {
    this.routePoints = points;
    this.drawRoute();
    this.backdrop?.setRoute(points);
  }

  setAppearance(appearance: SceneAppearance): void {
    this.appearance = appearance;
    this.applyAppearance();
  }

  setCamera(mode: CameraMode): void {
    this.mode = mode;
  }

  setRunning(running: boolean): void {
    if (this.destroyed || running === this.running) return;
    this.running = running;
    cancelAnimationFrame(this.frame);
    if (!running) return;
    this.lastFrame = performance.now();
    const loop = (time: number) => {
      if (!this.running) return;
      this.frame = requestAnimationFrame(loop);
      if (time - this.lastFrame >= FRAME_MS) this.draw(time);
    };
    this.frame = requestAnimationFrame(loop);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.setRunning(false);
    this.destroyed = true;
    this.resizer.disconnect();
    this.closeBackdrop();
    this.swissBuildings?.dispose();
    this.swissTrees?.dispose();
    this.google?.dispose();
    this.ground.dispose();
    this.sky.dispose();
    this.studio?.dispose();
    this.skyLight?.dispose();
    this.lights?.dispose();
    this.scene.traverse((object) => {
      if (object instanceof InstancedMesh) object.dispose();
      if (!(object instanceof Mesh)) return;
      object.geometry.dispose();
      for (const material of [object.material].flat() as Material[]) {
        for (const value of Object.values(material)) {
          if (value instanceof Texture) value.dispose();
        }
        material.dispose();
      }
    });
    Object.values(this.materials).forEach((material) => material.dispose());
    this.trunkShape.dispose();
    this.crownShape.dispose();
    this.renderer.dispose();
    // Browsers allow only a few contexts; do not wait for the garbage collector.
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }

  private get worldKind(): SceneWorld {
    return this.appearance?.world ?? 'plain';
  }

  /** The world made of our own geometry, not a map of a provider. */
  private get ownWorld(): boolean {
    return this.worldKind === 'real' || this.worldKind === 'plain';
  }

  private get quality() {
    return QUALITY[this.appearance?.options.quality ?? 'normal'];
  }

  private build(): void {
    const { renderer, scene } = this;
    renderer.toneMapping = ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.type = PCFShadowMap;
    this.container.append(renderer.domElement);

    const generator = new PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    this.studio = generator.fromScene(room, 0.04);
    room.dispose();
    this.lights = generator;
    scene.environment = this.studio.texture;

    // What lies on the ground, in this order; the car stays in front of it.
    towardsCamera(this.materials.sidewalk, 0.5);
    towardsCamera(this.materials.road, 0.7);
    towardsCamera(this.materials.line, 0.78);
    towardsCamera(this.materials.marking, 0.78);
    towardsCamera(this.materials.route, 0.86);

    this.inner.add(this.ground.group);
    this.world.add(this.inner);
    scene.add(this.sky.group, this.world, this.car, this.fallbackRoad);
    this.car.add(this.blob());
    this.buildFallbackRoad();
    this.resizer.observe(this.container);
    this.resize();
  }

  /** A plain road for as long as no position is known. */
  private buildFallbackRoad(): void {
    const flat = (width: number, length: number, material: Material) => {
      const mesh = new Mesh(new PlaneGeometry(width, length), material);
      mesh.rotation.x = -Math.PI / 2;
      this.fallbackRoad.add(mesh);
      return mesh;
    };
    const road = flat(9, 160, this.materials.stage);
    road.position.z = -60;
    road.receiveShadow = true;
    const edge = new MeshBasicMaterial({ color: 0x4c8dff, transparent: true, opacity: 0.55 });
    for (const x of [-4.3, 4.3]) flat(0.06, 160, edge).position.set(x, 0.012, -60);
    for (const x of [-1.75, 1.75]) {
      for (let i = 0; i < 24; i++) {
        const dash = flat(0.12, 2, this.materials.stageLine);
        dash.position.set(x, 0.01, 6 - i * 4.5);
        this.fallbackDashes.push(dash);
      }
    }
  }

  /** Soft dark spot below the car, also where no shadows are drawn. */
  private blob(): Mesh {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    const c = canvas.getContext('2d');
    if (c) {
      const gradient = c.createRadialGradient(64, 64, 4, 64, 64, 64);
      gradient.addColorStop(0, 'rgba(0,0,0,.75)');
      gradient.addColorStop(0.55, 'rgba(0,0,0,.35)');
      gradient.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = gradient;
      c.fillRect(0, 0, 128, 128);
    }
    const material = new MeshBasicMaterial({
      map: new CanvasTexture(canvas),
      transparent: true,
      depthWrite: false,
    });
    towardsCamera(material, 0.92);
    const blob = new Mesh(new PlaneGeometry(2.6, 5.4).rotateX(-Math.PI / 2), material);
    blob.position.y = 0.04;
    blob.renderOrder = 9;
    return blob;
  }

  /** Wheels are found by node name, paint and tail lights by material name. */
  private async loadCar(): Promise<void> {
    const url = new URL('models/car.glb', document.baseURI).href;
    const model = (await new GLTFLoader().loadAsync(url)).scene;
    const size = new Box3().setFromObject(model).getSize(new Vector3());
    if (!model.getObjectByName('XsaraPicasso')) {
      // A foreign model: bring it to size and turn its long side into driving direction.
      model.scale.setScalar(CAR_LENGTH_M / Math.max(size.x, size.z));
      model.rotation.y = size.x > size.z ? Math.PI / 2 : 0;
    }
    const box = new Box3().setFromObject(model);
    const center = box.getCenter(new Vector3());
    model.position.add(new Vector3(-center.x, -box.min.y, -center.z));
    const patched = new Set<Material>();
    const isWheel = (object: Object3D | null) => /^wheel/i.test(object?.name ?? '');
    model.traverse((object) => {
      if (isWheel(object) && !isWheel(object.parent)) {
        object.rotation.order = 'YXZ';
        this.wheels.push(object);
      }
      if (!(object instanceof Mesh)) return;
      object.castShadow = true;
      for (const material of [object.material].flat()) {
        if (!patched.has(material)) towardsCamera(material, 1.3);
        patched.add(material);
        if (!(material instanceof MeshStandardMaterial)) continue;
        if (material.name === 'tail') this.tail = material;
        if (material.name === 'paint' && !this.paint.includes(material)) this.paint.push(material);
      }
    });
    this.car.add(model);
    this.applyAppearance();
  }

  private applyAppearance(): void {
    const appearance = this.appearance;
    if (!appearance || this.destroyed) return;
    const { options, carColor, dark } = appearance;
    const world = this.worldKind;
    const own = this.ownWorld;
    const inWorld = this.origin !== null;
    const swiss = own && this.origin !== null && hasAerialImages(this.origin);
    const real = world === 'real';
    // Buildings and trees of swisstopo stand at their true height.
    const terrain = swiss && (options.terrain || options.swissBuildings || options.swissTrees);

    this.ground.setOptions(real && swiss, options.sharpAerial, terrain);
    this.setTilesets(swiss && options.swissBuildings, swiss && options.swissTrees);
    this.setGoogle(world === 'google' && inWorld ? appearance.googleKey : '');
    this.setBackdrop(world === 'mapbox' && inWorld);

    this.renderer.shadowMap.enabled = options.shadows && this.quality.shadowMap > 0;
    this.applyPixelRatio();
    this.updateSun();

    const m = this.materials;
    // With the sky on, the light makes it dark; the colours stay those of the day.
    const darkColors = dark && !options.sky;
    const pick = (inReal: number, plainDark: number, plainLight: number) =>
      real ? inReal : darkColors ? plainDark : plainLight;
    const asphalt = options.roadDetails ? 0x55585e : undefined;
    m.road.color.set(asphalt ?? pick(0x3b3e44, 0x30353f, 0xffffff));
    const seeThrough = real && !options.roadDetails;
    m.road.opacity = seeThrough ? 0.55 : 1;
    if (m.road.transparent !== seeThrough) {
      m.road.transparent = seeThrough;
      m.road.needsUpdate = true;
    }
    this.uniforms.uAsphalt.value = options.roadDetails ? 1 : 0;
    this.uniforms.uFacades.value = options.facades ? 1 : 0;
    m.line.color.set(options.roadDetails ? 0xe8e8e2 : pick(0xf4f4f0, 0x6b7382, 0xc3c8d0));
    m.building.color.set(pick(0xffffff, 0x4a5160, 0xc9ced7));
    if (m.building.vertexColors !== real) {
      m.building.vertexColors = real;
      m.building.needsUpdate = true;
    }
    m.sidewalk.color.set(options.roadDetails ? 0x8d8f92 : darkColors ? 0x14161b : 0xeceef2);
    m.crown.color.set(pick(0x4d7536, 0x3a404c, 0x86a373));
    m.trunk.color.set(pick(0x5e4634, 0x2c313a, 0x7a6a5a));
    this.ground.material.color.set(pick(0x6f7a5e, 0x14161a, 0xaeb5a6));
    m.stage.color.set(dark ? 0x15171c : 0xd5d9e0);
    m.stageLine.color.set(dark ? 0x343944 : 0xffffff);
    this.paint.forEach((paint) => paint.color.copy(new Color(carColor)));

    this.ground.group.visible = own && inWorld;
    this.fallbackRoad.visible = !inWorld;
    if (this.environmentGroup) this.environmentGroup.visible = own;
    this.show('sidewalks', !real || options.roadDetails);
    this.show('markings', options.roadDetails);
    this.chooseBuildings();
    if (this.routeMesh) this.routeMesh.visible = own;
    this.credits();
  }

  private show(name: string, visible: boolean): void {
    const object = this.environmentGroup?.getObjectByName(name);
    if (object) object.visible = visible;
  }

  /** OpenStreetMap stands in as long as swisstopo has nothing to show. */
  private chooseBuildings(): void {
    this.show('buildings', !this.swissBuildings?.visible);
    this.show('trees', !this.swissTrees?.visible);
  }

  private credits(): void {
    const world = this.worldKind;
    let text = '';
    if (this.origin && world === 'google') {
      const copyright = this.google?.attribution();
      text = copyright ? 'Google · ' + copyright : 'Google';
    } else if (this.origin && this.ownWorld && this.appearance) {
      const { terrain, swissBuildings, swissTrees } = this.appearance.options;
      const swiss =
        hasAerialImages(this.origin) &&
        (world === 'real' || terrain || swissBuildings || swissTrees);
      text = (swiss ? '© swisstopo · ' : '') + '© OpenMapTiles © OpenStreetMap';
    } // the Mapbox map shows its own
    if (text === this.attribution) return;
    this.attribution = text;
    this.events.onAttribution(text);
  }

  private setTilesets(buildings: boolean, trees: boolean): void {
    const { errorTarget } = this.quality;
    if (buildings && !this.swissBuildings) {
      this.swissBuildings = swissTileset(
        SWISS_BUILDINGS,
        this.sources.tilesets,
        this.camera,
        errorTarget,
        (scene) => useMaterial(scene, this.materials.swissBuilding),
      );
      this.addTileset(this.swissBuildings);
    } else if (!buildings && this.swissBuildings) {
      this.swissBuildings.dispose();
      this.swissBuildings = undefined;
    }
    if (trees && !this.swissTrees) {
      this.swissTrees = swissTileset(
        SWISS_TREES,
        this.sources.tilesets,
        this.camera,
        errorTarget,
        castShadows,
      );
      this.addTileset(this.swissTrees);
    } else if (!trees && this.swissTrees) {
      this.swissTrees.dispose();
      this.swissTrees = undefined;
    }
    for (const tileset of [this.swissBuildings, this.swissTrees]) {
      if (tileset) tileset.quality = errorTarget;
    }
  }

  private setGoogle(key: string): void {
    if (key === this.googleKey) return;
    this.googleKey = key;
    this.google?.dispose();
    this.google = undefined;
    if (!key) return;
    this.google = googleTileset(key, this.camera, this.quality.errorTarget, (message) => {
      if (this.googleKey !== key || !/\b(400|401|403|429)\b|denied|quota/i.test(message)) return;
      this.events.onWorldFailed('google', true);
    });
    this.addTileset(this.google);
  }

  private addTileset(tileset: SceneTileset): void {
    this.inner.add(tileset.group);
    this.placeTilesets();
  }

  private placeTilesets(): void {
    if (!this.origin) return;
    this.swissBuildings?.place(this.origin, this.ground.base);
    this.swissTrees?.place(this.origin, this.ground.base);
    this.google?.place(this.origin, GOOGLE_BASE_M);
  }

  private setBackdrop(wanted: boolean): void {
    if (!wanted) return this.closeBackdrop();
    if (this.backdropToken || !this.appearance || !this.pose.at) return;
    const token = (this.backdropToken = {});
    const failed = (rejected: boolean) => {
      if (this.backdropToken !== token) return;
      this.closeBackdrop();
      this.events.onWorldFailed('mapbox', rejected);
    };
    const camera = backdropCamera(
      backdropView('chase', 0, 0),
      this.pose.at,
      this.pose.heading,
      this.container.clientHeight || 400,
    );
    MapboxBackdrop.open(
      this.container,
      this.sources.maps,
      this.appearance.mapboxToken,
      camera,
      lightPreset(this.sunNow),
      failed,
    ).then(
      (backdrop) => {
        if (this.backdropToken !== token) return backdrop.close();
        this.backdrop = backdrop;
        backdrop.setLight(lightPreset(this.sunNow));
        backdrop.setRoute(this.routePoints);
      },
      (error: { rejected?: boolean } | null) => failed(!!error?.rejected),
    );
  }

  private closeBackdrop(): void {
    this.backdropToken = undefined;
    this.backdrop?.close();
    this.backdrop = undefined;
  }

  private updateSun(): void {
    if (!this.appearance) return;
    const { options, dark } = this.appearance;
    // Without the sky, the light follows the chosen theme.
    const inWorld = this.origin !== null;
    this.sunNow =
      options.sky && inWorld
        ? sunPosition(new Date(), this.origin ?? SOMEWHERE)
        : { altitude: dark ? 0 : 40, azimuth: 200 };
    const world = this.worldKind;
    const drawn = world !== 'mapbox';
    this.sky.setSun(this.sunNow);
    this.sky.setVisible(options.sky && drawn && inWorld, options.sky && drawn && inWorld);
    this.sky.setShadows(options.shadows && drawn ? this.quality.shadowMap : 0);
    const { night } = this.sky;
    this.uniforms.uNight.value = night;
    this.lightFromSky(options.sky && inWorld);

    const { far } = this.quality;
    this.scene.fog = drawn ? this.fog : null;
    if (!inWorld) [this.fog.near, this.fog.far] = [14, 48];
    else if (world === 'google') [this.fog.near, this.fog.far] = [far, 3500];
    else [this.fog.near, this.fog.far] = [far * 0.25, world === 'real' ? far : far * 0.6];
    if (options.sky && inWorld) this.fog.color.copy(this.sky.horizon);
    else this.fog.color.set(dark ? 0x0b0c10 : 0xdfe3ea);
    this.camera.far = world === 'google' ? 4000 : Math.max(600, far * 1.2);
    this.camera.updateProjectionMatrix();
    this.backdrop?.setLight(lightPreset(this.sunNow));
  }

  /** Reflections and soft light come from the sky, or from a studio without it. */
  private lightFromSky(on: boolean): void {
    if (!on || !this.lights) {
      this.scene.environment = this.studio?.texture ?? null;
      this.scene.environmentIntensity = 0.12 + 0.43 * (1 - this.sky.night);
      return;
    }
    const { altitude, azimuth } = this.sunNow;
    const now = Math.round(altitude) + '/' + Math.round(azimuth / 4);
    if (now !== this.skyLightFor) {
      this.skyLightFor = now;
      this.sky.update(0);
      const next = this.lights.fromScene(this.sky.lightSource(), 0.02, 1, 400);
      this.skyLight?.dispose();
      this.skyLight = next;
    }
    this.scene.environment = this.skyLight?.texture ?? null;
    // Our sky is darker at night than a lit town.
    this.scene.environmentIntensity = 0.35 + 1.6 * this.sky.night;
  }

  private local([lon, lat]: LonLat): Flat {
    const origin = this.origin ?? [lon, lat];
    return [
      (lon - origin[0]) * metresPerDegreeLon(origin[1]),
      -(lat - origin[1]) * METRES_PER_DEGREE_LAT,
    ];
  }

  private lonLat(x: number, z: number): LonLat {
    const origin = this.origin ?? SOMEWHERE;
    return [origin[0] + x / metresPerDegreeLon(origin[1]), origin[1] - z / METRES_PER_DEGREE_LAT];
  }

  /** Makes `at` the new origin and moves everything along. */
  private rebase(at: LonLat): void {
    if (this.origin) {
      const [x, z] = this.local(at);
      this.smooth[0] -= x;
      this.smooth[1] -= z;
    }
    this.origin = at;
    const before = this.ground.base;
    this.ground.setFrame({
      origin: at,
      local: (point) => this.local(point),
      lonLat: (x, z) => this.lonLat(x, z),
    });
    this.groundY += before - this.ground.base;
    this.drapeAll();
    // Also decides again what exists here: the border may have been crossed.
    this.applyAppearance();
  }

  private drapeAll(): void {
    this.placeTilesets();
    this.placeEnvironment();
    this.drawRoute();
  }

  private placeEnvironment(): void {
    const group = this.environmentGroup;
    if (!this.environment || !group || !this.origin) return;
    const { center } = this.environment.data;
    const [x, z] = this.local(center);
    const scale = metresPerDegreeLon(this.origin[1]) / metresPerDegreeLon(center[1]);
    group.position.set(x, 0, z);
    group.scale.x = scale;
    for (const object of group.children) {
      if (object instanceof Mesh) this.ground.drape(object, x, z, scale);
    }
    this.plantTrees();
  }

  private plantTrees(): void {
    const group = this.environmentGroup;
    const place = group?.getObjectByName('trees');
    if (!group || !place || !this.environment) return;
    for (const old of [...place.children]) {
      place.remove(old);
      (old as InstancedMesh).dispose();
    }
    const trees = this.environment.geometry.trees;
    const count = trees.length / 3;
    if (!count) return;
    const trunks = new InstancedMesh(this.trunkShape, this.materials.trunk, count);
    const crowns = new InstancedMesh(this.crownShape, this.materials.crown, count);
    crowns.castShadow = trunks.castShadow = true;
    const matrix = new Matrix4();
    const at = new Vector3();
    const scale = new Vector3();
    const straight = new Quaternion();
    const turned = new Quaternion();
    const up = new Vector3(0, 1, 0);
    for (let i = 0; i < count; i++) {
      const [x, z, h] = trees.subarray(i * 3, i * 3 + 3);
      const y = this.ground.elevation(x * group.scale.x + group.position.x, z + group.position.z);
      matrix.compose(at.set(x, y + h * 0.22, z), straight, scale.set(1, h * 0.44, 1));
      trunks.setMatrixAt(i, matrix);
      turned.setFromAxisAngle(up, (x * 7 + z) % 6.28);
      matrix.compose(at.set(x, y + h * 0.62, z), turned, scale.set(h * 0.3, h * 0.36, h * 0.3));
      crowns.setMatrixAt(i, matrix);
    }
    place.add(trunks, crowns);
  }

  private drawRoute(): void {
    if (this.routeMesh) {
      this.inner.remove(this.routeMesh);
      this.routeMesh.geometry.dispose();
      this.routeMesh = undefined;
    }
    if (!this.routePoints || !this.origin) return;
    // Only the part around the car; a route may be hundreds of kilometres long.
    const near = this.routePoints.map((point) => this.local(point));
    const isNear = ([x, z]: Flat) => Math.hypot(x, z) < ROUTE_RADIUS_M;
    const first = near.findIndex(isNear);
    if (first < 0) return;
    let last = first;
    for (let i = first; i < near.length; i++) if (isNear(near[i])) last = i;
    const part = near.slice(Math.max(0, first - 1), last + 2);
    const mesh = new Mesh(toGeometry(ribbon(part, 2.6, 0.04)), this.materials.route);
    mesh.frustumCulled = false;
    mesh.renderOrder = 8;
    mesh.visible = this.ownWorld;
    this.ground.drape(mesh);
    this.routeMesh = mesh;
    this.inner.add(mesh);
  }

  private draw(time: number): void {
    const elapsed = time - this.lastFrame;
    this.lastFrame = time;
    const dt = Math.min(0.1, elapsed / 1000);
    const speed = this.pose.speedKmh / 3.6;
    this.degradeIfSlow(elapsed);
    if (time - this.lastSlowCheck > SLOW_CHECK_MS) {
      this.lastSlowCheck = time;
      this.updateSun();
      for (const tileset of [this.swissBuildings, this.swissTrees, this.google]) tileset?.retry();
    }

    if (this.origin) this.moveWorld(time, dt, speed);
    else {
      for (const dash of this.fallbackDashes) {
        dash.position.z += speed * dt;
        if (dash.position.z > 8) dash.position.z -= 108;
      }
    }
    this.moveCar(dt, speed);
    this.moveCamera(time, dt, speed);
    this.sky.update(this.smoothHeading);
    this.scene.environmentRotation.y = this.smoothHeading * RAD;
    if (this.origin && time - this.lastGround > GROUND_CHECK_MS) {
      this.lastGround = time;
      this.checkGround();
    }
    this.inner.updateWorldMatrix(true, false);
    this.uniforms.uToLocal.value.copy(this.inner.matrixWorld).invert();
    this.swissBuildings?.update(this.renderer);
    this.swissTrees?.update(this.renderer);
    this.google?.update(this.renderer);
    this.renderer.render(this.scene, this.camera);
  }

  private checkGround(): void {
    if (this.ownWorld) {
      this.ground.update(this.lonLat(...this.smooth), ...this.smooth);
      this.chooseBuildings();
    }
    if (this.google) {
      const surface = this.google.surface();
      // Trees and bridges must not lift the car at once.
      if (surface !== null) this.groundY += Math.abs(surface) > 30 ? surface : surface * 0.5;
      this.credits();
    }
  }

  private moveWorld(time: number, dt: number, speed: number): void {
    const { at, heading, extrapolate } = this.pose;
    if (!at) return;
    let [x, z] = this.local(at);
    if (Math.hypot(x, z) > REBASE_M) {
      this.rebase(at);
      [x, z] = [0, 0];
    }
    if (extrapolate && speed > 1) {
      // GPS reports once per second; keep rolling in between.
      const metres = speed * Math.min(MAX_EXTRAPOLATION_S, (time - this.poseTime) / 1000);
      x += Math.sin(heading * RAD) * metres;
      z -= Math.cos(heading * RAD) * metres;
    }
    const jumped = !this.placed || Math.hypot(x - this.smooth[0], z - this.smooth[1]) > JUMP_M;
    if (jumped) {
      this.smooth[0] = x;
      this.smooth[1] = z;
      this.smoothHeading = heading;
      this.placed = true;
    }
    const share = Math.min(1, dt * 8);
    this.smooth[0] += (x - this.smooth[0]) * share;
    this.smooth[1] += (z - this.smooth[1]) * share;
    const before = this.smoothHeading;
    this.smoothHeading = turnTowards(before, heading, Math.min(1, dt * 6));
    const turned = ((this.smoothHeading - before + 540) % 360) - 180;
    const rate = dt > 0 ? turned / dt : 0;
    this.steer += (Math.max(-0.3, Math.min(0.3, rate * 0.006)) - this.steer) * 0.08;
    this.world.rotation.y = this.smoothHeading * RAD;

    let pitch = 0;
    if (this.ownWorld) {
      const [sx, sz] = this.smooth;
      const dx = Math.sin(this.smoothHeading * RAD) * 1.6;
      const dz = -Math.cos(this.smoothHeading * RAD) * 1.6;
      const front = this.ground.elevation(sx + dx, sz + dz);
      const rear = this.ground.elevation(sx - dx, sz - dz);
      this.groundY += ((front + rear) / 2 - this.groundY) * (jumped ? 1 : Math.min(1, dt * 10));
      pitch = Math.atan2(front - rear, 3.2);
    }
    this.car.rotation.x += (pitch - this.car.rotation.x) * Math.min(1, dt * 6);
    this.inner.position.set(-this.smooth[0], -this.groundY, -this.smooth[1]);
  }

  private moveCar(dt: number, speed: number): void {
    this.car.rotation.y = -this.steer;
    this.car.rotation.z = this.steer * 0.06 * Math.min(1, speed / 10);
    for (const wheel of this.wheels) {
      wheel.rotation.x -= (speed * dt) / WHEEL_RADIUS_M;
      if (wheel.position.z < 0) wheel.rotation.y = -this.steer * 1.6;
    }
    const kmh = this.pose.speedKmh;
    const braking = kmh < this.lastSpeed - 0.05 && kmh > 1;
    this.brake = braking ? 1 : Math.max(0, this.brake - dt * 3);
    this.lastSpeed = kmh;
    this.tail?.emissive.setRGB(0.25 + this.brake * 0.95, this.brake * 0.05, 0);
    this.stoppedS = kmh < 2 ? this.stoppedS + dt : 0;
  }

  private moveCamera(time: number, dt: number, speed: number): void {
    const mode = activeMode(this.mode, this.stoppedS, this.calm);
    if (mode === 'orbit' && !this.calm) this.orbitAngle += dt * 0.22;
    if (this.backdrop && this.origin) {
      const view = backdropView(mode, speed, (this.orbitAngle / RAD) % 360);
      const { position, target } = backdropPosition(view);
      this.setFov(MAPBOX_FOV);
      this.camera.position.set(...position);
      this.camera.lookAt(...target);
      const camera = backdropCamera(
        view,
        this.lonLat(...this.smooth),
        this.smoothHeading,
        this.container.clientHeight || 400,
      );
      this.backdrop.setCamera(camera, this.smoothHeading, time);
      return;
    }
    this.setFov(this.camera.aspect < 1.1 ? 44 : 34);
    const view = cameraView(mode, speed, this.origin !== null, this.orbitAngle);
    const share = Math.min(1, dt * 3.5);
    this.cameraAt.lerp(this.wanted.set(...view.position), share);
    this.cameraTarget.lerp(this.wanted.set(...view.target), share);
    this.camera.position.copy(this.cameraAt);
    this.camera.lookAt(this.cameraTarget);
  }

  private setFov(fov: number): void {
    if (this.camera.fov === fov) return;
    this.camera.fov = fov;
    this.camera.updateProjectionMatrix();
  }

  /** Draws with fewer pixels on devices that cannot keep up. */
  private degradeIfSlow(elapsedMs: number): void {
    if (elapsedMs > 500) return; // was paused
    this.slowFrames = Math.max(0, this.slowFrames + (elapsedMs > SLOW_FRAME_MS ? 1 : -1));
    if (this.slowFrames < 60 || this.slowdown < 0.5) return;
    this.slowFrames = 0;
    this.slowdown *= 0.8;
    this.applyPixelRatio();
  }

  private applyPixelRatio(): void {
    const wanted = Math.min(devicePixelRatio, this.quality.pixelRatio) * this.slowdown;
    const ratio = Math.max(0.75, wanted);
    if (Math.abs(ratio - this.renderer.getPixelRatio()) < 0.01) return;
    this.renderer.setPixelRatio(ratio);
    this.resize();
  }

  private resize(): void {
    const { clientWidth: width, clientHeight: height } = this.container;
    if (!width || !height || this.destroyed) return;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }
}

function toGeometry(data: MeshData): BufferGeometry {
  const geometry = new BufferGeometry();
  // Own copy: draping changes the heights.
  geometry.setAttribute('position', new BufferAttribute(data.position.slice(), 3));
  geometry.setAttribute('normal', new BufferAttribute(data.normal, 3));
  if (data.color) geometry.setAttribute('color', new BufferAttribute(data.color, 3));
  geometry.setIndex(new BufferAttribute(data.index, 1));
  return geometry;
}
