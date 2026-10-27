import {
  ACESFilmicToneMapping,
  Color,
  DirectionalLight,
  Fog,
  HemisphereLight,
  PCFShadowMap,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from 'three';
import { CAMERA_YAW } from '../config/balance';
import type { PlanetPalette } from '../config/planets/types';

const CAMERA_PITCH_HEIGHT = 17;
const CAMERA_DISTANCE = 14;
const PORTRAIT_ZOOM_OUT = 1.75;
const FOLLOW_SHARPNESS = 6;
const SHADOW_EXTENT = 22;
const SUN_OFFSET = new Vector3(-12, 26, 8);

/** Renderer, camera and lighting. Knows nothing about game rules. */
export class SceneRig {
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(38, 1, 0.5, 400);
  readonly renderer: WebGLRenderer;
  private readonly sun: DirectionalLight;
  private readonly ambient: HemisphereLight;
  private readonly focus = new Vector3();
  private readonly offset = new Vector3();
  private readonly shake = new Vector3();
  private shakeStrength = 0;
  private zoom = 1;

  constructor(private readonly container: HTMLElement) {
    const isHighDensity = window.devicePixelRatio > 1.5;
    this.renderer = new WebGLRenderer({ antialias: !isHighDensity, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFShadowMap;
    this.renderer.domElement.className = 'game-canvas';
    this.renderer.domElement.setAttribute('aria-hidden', 'true');
    container.appendChild(this.renderer.domElement);

    this.ambient = new HemisphereLight(0xffffff, 0x222222, 1.4);
    this.sun = new DirectionalLight(0xffffff, 2.4);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(isHighDensity ? 1024 : 2048, isHighDensity ? 1024 : 2048);
    const shadowCamera = this.sun.shadow.camera;
    shadowCamera.left = -SHADOW_EXTENT;
    shadowCamera.right = SHADOW_EXTENT;
    shadowCamera.top = SHADOW_EXTENT;
    shadowCamera.bottom = -SHADOW_EXTENT;
    shadowCamera.near = 1;
    shadowCamera.far = 80;
    this.sun.shadow.bias = -0.0008;
    this.sun.shadow.normalBias = 0.03;
    this.scene.add(this.ambient, this.sun, this.sun.target);

    this.resize();
  }

  get canvas(): HTMLCanvasElement {
    return this.renderer.domElement;
  }

  applyPalette(palette: PlanetPalette): void {
    const sky = new Color(palette.sky);
    this.scene.background = sky;
    this.scene.fog = new Fog(sky, 55, 120);
    this.ambient.color.setHex(palette.ambientSky);
    this.ambient.groundColor.setHex(palette.ambientGround);
    this.sun.color.setHex(palette.sunColor);
  }

  resize(): void {
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    this.camera.aspect = width / height;
    this.zoom = this.camera.aspect < 1 ? PORTRAIT_ZOOM_OUT : 1;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  /** Camera shake that decays over time; callers should skip it for reduced motion. */
  addShake(strength: number): void {
    this.shakeStrength = Math.max(this.shakeStrength, strength);
  }

  /**
   * Eases the camera toward `target`. Pass `snap` after teleports so the
   * camera does not sweep across the map.
   */
  follow(target: Vector3, dt: number, snap = false): void {
    const blend = snap ? 1 : 1 - Math.exp(-FOLLOW_SHARPNESS * dt);
    this.focus.lerp(target, blend);

    this.offset.set(
      Math.sin(CAMERA_YAW) * CAMERA_DISTANCE * this.zoom,
      CAMERA_PITCH_HEIGHT * this.zoom,
      Math.cos(CAMERA_YAW) * CAMERA_DISTANCE * this.zoom,
    );
    this.shakeStrength *= Math.exp(-5 * dt);
    this.shake.set(
      (Math.random() - 0.5) * this.shakeStrength,
      (Math.random() - 0.5) * this.shakeStrength,
      (Math.random() - 0.5) * this.shakeStrength,
    );
    this.camera.position.copy(this.focus).add(this.offset).add(this.shake);
    this.camera.lookAt(this.focus);

    this.sun.position.copy(this.focus).add(SUN_OFFSET);
    this.sun.target.position.copy(this.focus);
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
