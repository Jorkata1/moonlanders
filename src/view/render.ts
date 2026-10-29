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
import { GTAOPass } from "three/examples/jsm/postprocessing/GTAOPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import type { Quality } from "../quality";

const EXPOSURE = 1.0;
const BLOOM = { strength: 0.6, radius: 0.55, threshold: 0.95 } as const;

/** Final look: a touch more contrast and saturation, cool shadows, warm highlights and a soft vignette. */
const GRADE = {
  uniforms: { tDiffuse: { value: null }, vignette: { value: 0.42 } },
  vertexShader: "varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float vignette; varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      c.rgb = mix(vec3(l), c.rgb, 1.3);
      c.rgb = (c.rgb - 0.5) * 1.12 + 0.5;
      c.rgb += mix(vec3(-0.012, 0.0, 0.03), vec3(0.03, 0.012, -0.02), smoothstep(0.15, 0.8, l));
      float d = distance(vUv, vec2(0.5));
      c.rgb *= 1.0 - vignette * smoothstep(0.35, 0.85, d);
      gl_FragColor = vec4(clamp(c.rgb, 0.0, 1.0), c.a);
    }`,
};

/** True for things that should cast no ambient occlusion: smoke sprites, particles, lines and glass. */
function isSeeThrough(object: Object3D): boolean {
  if (object instanceof Sprite || object instanceof Points || (object as { isLine?: boolean }).isLine === true) return true;
  if (!(object instanceof Mesh)) return false;
  const material = Array.isArray(object.material) ? object.material[0] : object.material;
  return (material as Material | undefined)?.transparent === true;
}

/**
 * GTAO draws the scene into a depth/normal buffer with an override material, which would turn
 * smoke puffs and glass into solid black blocks; hide them while it does.
 */
function ignoreSeeThrough(pass: GTAOPass, scene: Scene): void {
  const visible = new Map<Object3D, boolean>();
  pass.overrideVisibility = () => {
    scene.traverse((object) => {
      visible.set(object, object.visible);
      if (isSeeThrough(object)) object.visible = false;
    });
  };
  pass.restoreVisibility = () => {
    for (const [object, shown] of visible) object.visible = shown;
    visible.clear();
  };
}

export interface RenderPipeline {
  readonly renderer: WebGLRenderer;
  render(): void;
  resize(width: number, height: number): void;
  /** Draw a different scene from now on (the intro's orbit set), or the original one again with null. */
  setScene(next: Scene | null): void;
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
  let aoPass: GTAOPass | null = null;
  let renderPass: RenderPass | null = null;
  let current = scene;

  if (quality.bloom) {
    const target = new WebGLRenderTarget(1, 1, { type: HalfFloatType, samples: quality.msaaSamples });
    composer = new EffectComposer(renderer, target);
    renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);
    const ao = new GTAOPass(scene, camera, 1, 1);
    ao.updateGtaoMaterial({ radius: 1.8, distanceExponent: 1.4, thickness: 2.5, scale: 2.2, samples: 16 });
    ao.blendIntensity = 1;
    ignoreSeeThrough(ao, scene);
    composer.addPass(ao);
    aoPass = ao;
    bloomPass = new UnrealBloomPass(new Vector2(1, 1), BLOOM.strength, BLOOM.radius, BLOOM.threshold);
    composer.addPass(bloomPass);
    composer.addPass(new OutputPass());
    composer.addPass(new ShaderPass(GRADE));
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
      else renderer.render(current, camera);
    },
    setScene(next) {
      current = next ?? scene;
      if (renderPass) renderPass.scene = current;
      if (aoPass) {
        aoPass.scene = current;
        ignoreSeeThrough(aoPass, current);
      }
    },
    resize(width, height) {
      renderer.setSize(width, height, false);
      composer?.setSize(width, height);
      composer?.setPixelRatio(quality.pixelRatio);
      // Bloom at half resolution looks the same and costs a quarter as much.
      bloomPass?.resolution.set(width / 2, height / 2);
      aoPass?.setSize(width * quality.pixelRatio, height * quality.pixelRatio);
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
