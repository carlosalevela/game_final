// ZombieLoader.js
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js' // ✅

const loader = new GLTFLoader()

export async function loadZombie() {
  return new Promise((resolve, reject) => {
    loader.load(
      '/models/zombie/zombie.glb',
      (gltf) => {
        const base = gltf.scene
        base.traverse(o => {
          if (o.isMesh) {
            o.castShadow = true
            o.receiveShadow = true
          }
        })
        resolve({ base, animations: gltf.animations })
      },
      undefined,
      reject
    )
  })
}

export function makeZombieInstance(base) {
  return SkeletonUtils.clone(base) // ✅
}
