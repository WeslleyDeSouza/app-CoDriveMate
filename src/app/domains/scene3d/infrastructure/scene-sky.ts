import {
  BackSide,
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  Object3D,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  SpotLight,
  Vector3,
} from 'three';
import { SunPosition, daylight, skyColors } from '../domain/sun';

const RAD = Math.PI / 180;

/** Sky dome, sun, ambient light and headlights. */
export class SceneSky {
  readonly group = new Group();
  readonly horizon = new Color();
  private readonly sun = new DirectionalLight(0xffffff, 2);
  private readonly ambient = new HemisphereLight(0xffffff, 0x6b665c, 1);
  private readonly headlights = new Group();
  private readonly direction = new Vector3(0.3, 0.8, 0.4);
  private readonly material = new ShaderMaterial({
    side: BackSide,
    depthWrite: false,
    depthTest: false,
    fog: false,
    uniforms: {
      uTop: { value: new Color() },
      uHorizon: { value: this.horizon },
      uSun: { value: new Vector3(0, 1, 0) },
      uGlow: { value: 1 },
    },
    vertexShader: `varying vec3 vDir;
      void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `varying vec3 vDir; uniform vec3 uTop, uHorizon, uSun; uniform float uGlow;
      void main() {
        vec3 d = normalize(vDir);
        float h = clamp(d.y, 0.0, 1.0);
        vec3 c = mix(uHorizon, uTop, pow(h, 0.55));
        if (d.y < 0.0) c = mix(c, uHorizon * 0.3, clamp(-d.y * 5.0, 0.0, 1.0));
        float s = max(dot(d, uSun), 0.0);
        c += vec3(1.0, 0.78, 0.5) * (pow(s, 12.0) * 0.16 + pow(s, 900.0) * 1.6) * uGlow;
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  private readonly dome = new Mesh(new SphereGeometry(300, 24, 16), this.material);
  private altitude = 30;
  private azimuth = 180;

  constructor(car: Object3D) {
    this.dome.renderOrder = -10;
    this.dome.frustumCulled = false;
    const shadow = this.sun.shadow;
    shadow.camera.left = shadow.camera.bottom = -45;
    shadow.camera.right = shadow.camera.top = 45;
    shadow.camera.near = 1;
    shadow.camera.far = 260;
    shadow.bias = -0.003;
    shadow.normalBias = 0.18;
    for (const x of [-0.6, 0.6]) {
      const lamp = new SpotLight(0xfff2d8, 160, 70, 0.42, 0.7, 1.3);
      lamp.position.set(x, 0.7, -2);
      lamp.target.position.set(x * 1.8, 0, -16);
      this.headlights.add(lamp, lamp.target);
    }
    car.add(this.headlights);
    this.group.add(this.dome, this.sun, this.sun.target, this.ambient);
  }

  get night(): number {
    return 1 - daylight(this.altitude);
  }

  setSun({ altitude, azimuth }: SunPosition): void {
    this.altitude = altitude;
    this.azimuth = azimuth;
    const { top, horizon } = skyColors(altitude);
    this.material.uniforms['uTop'].value.setRGB(...top);
    this.horizon.setRGB(...horizon);
    const day = daylight(altitude);
    this.material.uniforms['uGlow'].value = altitude > -8 ? 0.4 + 0.6 * day : 0;
    this.sun.color.setRGB(1, 0.72 + 0.26 * Math.min(1, altitude / 25), 0.5 + 0.44 * day);
    // At night the moon gives a little shape.
    this.sun.intensity = 0.12 + 3 * day;
    this.ambient.intensity = 0.25 + 0.75 * day;
    this.ambient.color.setRGB(0.75 + 0.25 * day, 0.82 + 0.15 * day, 1 - 0.06 * day);
  }

  setVisible(sky: boolean, headlights: boolean): void {
    this.dome.visible = sky;
    this.headlights.visible = headlights && this.night > 0.5;
  }

  /** The sky alone, to light everything else with it. */
  lightSource(): Scene {
    const scene = new Scene();
    scene.add(new Mesh(this.dome.geometry, this.material));
    return scene;
  }

  /** @param size of the shadow map, 0 = no shadows */
  setShadows(size: number): void {
    this.sun.castShadow = size > 0 && this.altitude > 2;
    if (size && this.sun.shadow.mapSize.x !== size) {
      this.sun.shadow.mapSize.set(size, size);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
  }

  /** The world turns around the car, so the sun turns with it. */
  update(heading: number): void {
    const up = Math.max(this.altitude, 12) * RAD;
    const angle = (this.azimuth - heading) * RAD;
    this.direction.set(
      Math.sin(angle) * Math.cos(up),
      Math.sin(up),
      -Math.cos(angle) * Math.cos(up),
    );
    this.sun.position.copy(this.direction).multiplyScalar(120);
    const real = this.altitude * RAD;
    this.material.uniforms['uSun'].value.set(
      Math.sin(angle) * Math.cos(real),
      Math.sin(real),
      -Math.cos(angle) * Math.cos(real),
    );
  }

  dispose(): void {
    this.dome.geometry.dispose();
    this.material.dispose();
    this.sun.dispose();
    for (const lamp of this.headlights.children) if (lamp instanceof SpotLight) lamp.dispose();
  }
}
