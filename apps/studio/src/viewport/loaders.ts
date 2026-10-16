/** Loading reference models (glTF/GLB/OBJ/STL) from data URIs or URLs. */
import * as THREE from "three";
import type { SceneModel } from "@ledlay/core";

const neutral = () => new THREE.MeshStandardMaterial({ color: 0x8892a6, roughness: 0.85, metalness: 0.05, side: THREE.DoubleSide });

export async function loadModel(format: SceneModel["format"], uri: string): Promise<THREE.Object3D> {
  switch (format) {
    case "gltf":
    case "glb": {
      const { GLTFLoader } = await import("three/addons/loaders/GLTFLoader.js");
      const gltf = await new GLTFLoader().loadAsync(uri);
      return gltf.scene;
    }
    case "obj": {
      const { OBJLoader } = await import("three/addons/loaders/OBJLoader.js");
      const obj = await new OBJLoader().loadAsync(uri);
      obj.traverse((c) => {
        if ((c as THREE.Mesh).isMesh) (c as THREE.Mesh).material = neutral();
      });
      return obj;
    }
    case "stl": {
      const { STLLoader } = await import("three/addons/loaders/STLLoader.js");
      const geom = await new STLLoader().loadAsync(uri);
      geom.computeVertexNormals();
      return new THREE.Mesh(geom, neutral());
    }
  }
}
