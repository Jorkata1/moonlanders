import {
  ACESFilmicToneMapping,
  HalfFloatType,
  Mesh,
  MeshStandardMaterial,
  PCFSoftShadowMap,
  PMREMGenerator,
  Points,
  Sprite,
  Texture,
  Vector2,
  WebGLRenderTarget,
  WebGLRenderer,
  type Material,
  type Object3D,
  type PerspectiveCamera,
  type Scene,
} from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import type { Quality } from "../quality";

const EXPOSURE = 1.0;
const BLOOM = { strength: 0.55, radius: 0.5, threshold: 1.0 } as const;

export interface RenderPipeline {
  readonly renderer: WebGLRenderer;
  render(): void;
  resize(width: number, height: number): void;
  /** Give every material flagged `userData.reflective` the studio reflection map. */
  applyReflections(root: Object3D): void;
  /** Free GPU memory so another pipeline can take over the same canvas. */
  dispose(): void;
}

function createReflectionMap(renderer: WebGLRenderer): Texture {
  const pmrem = new PMREMGenerator(renderer);
  const room = new RoomEnvironment(renderer);
  const texture = pmrem.fromScene(room, 0.04).texture;
  room.dispose();
  pmrem.dispose();
  return texture;
}

export function createRenderPipeline(canvas: HTMLCanvasElement, scene: Scene, camera: PerspectiveCamera, quality: Quality): RenderPipeline {
  const renderer = new WebGLRenderer({ canvas, antialias: !quality.bloom, powerPreference: "high-performance" });
  renderer.setPixelRatio(quality.pixelRatio);
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = EXPOSURE;
  renderer.shadowMap.enabled = quality.shadowLights > 0;
  renderer.shadowMap.type = PCFSoftShadowMap;

  const reflections = createReflectionMap(renderer);
  let composer: EffectComposer | null = null;
  let bloomPass: UnrealBloomPass | null = null;

  if (quality.bloom) {
    const target = new WebGLRenderTarget(1, 1, { type: HalfFloatType, samples: quality.msaaSamples });
    composer = new EffectComposer(renderer, target);
    composer.addPass(new RenderPass(scene, camera));
    bloomPass = new UnrealBloomPass(new Vector2(1, 1), BLOOM.strength, BLOOM.radius, BLOOM.threshold);
    composer.addPass(bloomPass);
    composer.addPass(new OutputPass());
  }

  function applyReflections(root: Object3D): void {
    root.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const mat of materials) {
        if (mat instanceof MeshStandardMaterial && mat.userData.reflective === true && mat.envMap !== reflections) {
          mat.envMap = reflections;
          mat.needsUpdate = true;
        }
      }
    });
  }

  return {
    renderer,
    render() {
      if (composer) composer.render();
      else renderer.render(scene, camera);
    },
    resize(width, height) {
      renderer.setSize(width, height, false);
      composer?.setSize(width, height);
      composer?.setPixelRatio(quality.pixelRatio);
      // Bloom at half resolution looks the same and costs a quarter as much.
      bloomPass?.resolution.set(width / 2, height / 2);
    },
    applyReflections,
    dispose() {
      composer?.dispose();
      bloomPass?.dispose();
      reflections.dispose();
      // The next renderer reuses this WebGL context and assumes default upload settings.
      const gl = renderer.getContext();
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      renderer.dispose();
    },
  };
}

/** Every opaque lit mesh casts and receives shadows; pick boxes, sprites and glass do not. */
export function enableShadows(root: Object3D): void {
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const mat = Array.isArray(object.material) ? object.material[0] : object.material;
    if (!(mat instanceof MeshStandardMaterial) || mat.transparent || !mat.visible) return;
    object.castShadow = mat.userData.noShadow !== true && object.userData.noCastShadow !== true;
    object.receiveShadow = true;
  });
}

function disposeMaterial(material: Material): void {
  for (const value of Object.values(material)) if (value instanceof Texture) value.dispose();
  material.dispose();
}

/** Release every geometry, material and texture in the scene. Shared ones are re-uploaded on next use. */
export function disposeScene(scene: Scene): void {
  scene.traverse((object) => {
    if (!(object instanceof Mesh || object instanceof Points || object instanceof Sprite)) return;
    object.geometry.dispose();
    const materials: Material[] = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach(disposeMaterial);
  });
  scene.clear();
}
