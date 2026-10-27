import { InstancedMesh, Mesh, Points, type Material, type Object3D } from 'three';

function disposeMaterial(material: Material): void {
  // Cached materials are shared across planets; only per-object ones are freed.
  if (material.userData.unique === true) material.dispose();
}

/** Frees GPU resources owned by `root` and its descendants. */
export function disposeObject(root: Object3D): void {
  root.traverse((child) => {
    if (!(child instanceof Mesh) && !(child instanceof Points)) return;
    child.geometry.dispose();
    if (child instanceof InstancedMesh) child.dispose();
    const material: Material | Material[] = child.material;
    if (Array.isArray(material)) material.forEach(disposeMaterial);
    else disposeMaterial(material);
  });
}
