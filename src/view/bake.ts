import { BufferAttribute, BufferGeometry, Float32BufferAttribute, InstancedMesh, Matrix4, Mesh, type Material, type Object3D } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/**
 * Merge every static mesh under `root` into one mesh per material, in root's local space.
 * Cuts hundreds of draw calls to a handful. Anything under a node with `userData.dynamic`
 * (spinning rotors, trays, labels) is left untouched.
 */
export function bakeStatic(root: Object3D): void {
  root.updateMatrixWorld(true);
  const toLocal = new Matrix4().copy(root.matrixWorld).invert();
  const buckets = new Map<string, { material: Material; castShadow: boolean; geometries: BufferGeometry[]; meshes: Mesh[] }>();

  function visit(node: Object3D): void {
    if (node !== root && node.userData.dynamic === true) return;
    for (const child of node.children) visit(child);
    if (!(node instanceof Mesh) || node instanceof InstancedMesh || Array.isArray(node.material) || !node.visible) return;
    const material = node.material as Material;
    if (material.transparent) return;
    const geometry = prepare(node.geometry, new Matrix4().multiplyMatrices(toLocal, node.matrixWorld));
    if (!geometry) return;
    const key = `${material.uuid}|${node.castShadow}`;
    const bucket = buckets.get(key) ?? { material, castShadow: node.castShadow, geometries: [], meshes: [] };
    bucket.geometries.push(geometry);
    bucket.meshes.push(node);
    buckets.set(key, bucket);
  }
  visit(root);

  for (const bucket of buckets.values()) {
    if (bucket.meshes.length < 2) continue;
    const merged = mergeGeometries(bucket.geometries, false);
    if (!merged) continue;
    for (const mesh of bucket.meshes) mesh.removeFromParent();
    const baked = new Mesh(merged, bucket.material);
    baked.castShadow = bucket.castShadow;
    baked.receiveShadow = true;
    baked.userData.baked = true;
    root.add(baked);
  }
}

/** World-transformed, non-indexed copy with exactly position, normal and uv, so all pieces merge. */
function prepare(source: BufferGeometry, matrix: Matrix4): BufferGeometry | null {
  const position = source.getAttribute("position");
  if (!position) return null;
  const geometry = (source.index ? source.toNonIndexed() : source.clone()) as BufferGeometry;
  for (const name of Object.keys(geometry.attributes)) {
    if (name !== "position" && name !== "normal" && name !== "uv") geometry.deleteAttribute(name);
  }
  if (!geometry.getAttribute("normal")) geometry.computeVertexNormals();
  if (!geometry.getAttribute("uv")) geometry.setAttribute("uv", new Float32BufferAttribute(new Float32Array((geometry.getAttribute("position") as BufferAttribute).count * 2), 2));
  geometry.clearGroups();
  geometry.applyMatrix4(matrix);
  return geometry;
}
