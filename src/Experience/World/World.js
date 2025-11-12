import * as THREE from 'three'
import Environment from './Environment.js'
import Fox from './Fox.js'
import Robot from './Robot.js'
import ToyCarLoader from '../../loaders/ToyCarLoader.js'
import Floor from './Floor.js'
import ThirdPersonCamera from './ThirdPersonCamera.js'
import Sound from './Sound.js'
import AmbientSound from './AmbientSound.js'
import MobileControls from '../../controls/MobileControls.js'
import LevelManager from './LevelManager.js';
import BlockPrefab from './BlockPrefab.js'
import FinalPrizeParticles from '../Utils/FinalPrizeParticles.js'
import Enemy from './Enemy.js'

export default class World {
  constructor(experience) {
    this.experience = experience
    this.scene = this.experience.scene
    this.blockPrefab = new BlockPrefab(this.experience)
    this.resources = this.experience.resources
    this.levelManager = new LevelManager(this.experience);
    this.finalPrizeActivated = false
    this.gameStarted = false
    this.gameEnded = false
    this.enemies = []

    this.coinSound = new Sound('/sounds/coin.ogg')
    this.ambientSound = new AmbientSound('/sounds/ambiente.mp3')
    this.winner = new Sound('/sounds/winner.mp3')
    this.portalSound = new Sound('/sounds/portal.mp3')
    this.loseSound = new Sound('/sounds/lose.ogg')

    this.allowPrizePickup = false
    this.hasMoved = false
    this.defeatTriggered = false

    setTimeout(() => {
      this.allowPrizePickup = true
    }, 2000)

    this.resources.on('ready', async () => {
      this.floor = new Floor(this.experience)
      this.environment = new Environment(this.experience)

      this.loader = new ToyCarLoader(this.experience)
      await this.loader.loadFromAPI()

      this.fox = new Fox(this.experience)
      this.robot = new Robot(this.experience)

      // Enemigos múltiples
      this.enemyTemplate = new THREE.Mesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshStandardMaterial({ color: 0xff0000 })
      )
      const enemiesCountEnv = parseInt(import.meta.env.VITE_ENEMIES_COUNT || '3', 10)
      const enemiesCount = Number.isFinite(enemiesCountEnv) && enemiesCountEnv > 0 ? enemiesCountEnv : 3
      this.spawnEnemies(enemiesCount)

      this.experience.vr.bindCharacter(this.robot)
      this.thirdPersonCamera = new ThirdPersonCamera(this.experience, this.robot.group)

      this.mobileControls = new MobileControls({
        onUp:    (pressed) => { this.experience.keyboard.keys.up    = pressed },
        onDown:  (pressed) => { this.experience.keyboard.keys.down  = pressed },
        onLeft:  (pressed) => { this.experience.keyboard.keys.left  = pressed },
        onRight: (pressed) => { this.experience.keyboard.keys.right = pressed }
      })

      if (!this.experience.physics || !this.experience.physics.world) {
        console.error("🚫 Sistema de físicas no está inicializado al cargar el mundo.");
        return;
      }

      // Si se está en modo VR, ocultar el robot
      this._checkVRMode()
      this.experience.renderer.instance.xr.addEventListener('sessionstart', () => {
        this._checkVRMode()
      })
    })
  }

  // Crear varios enemigos en posiciones alejadas del jugador
  spawnEnemies(count = 3) {
    if (!this.robot?.body?.position) return
    const playerPos = this.robot.body.position
    const minRadius = 25
    const maxRadius = 40

    // Limpia anteriores si existen
    if (this.enemies?.length) {
      this.enemies.forEach(e => e?.destroy?.())
      this.enemies = []
    }

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2
      const radius = minRadius + Math.random() * (maxRadius - minRadius)
      const x = playerPos.x + Math.cos(angle) * radius
      const z = playerPos.z + Math.sin(angle) * radius
      const y = 1.5

      const enemy = new Enemy({
        scene: this.scene,
        physicsWorld: this.experience.physics.world,
        playerRef: this.robot,
        model: this.enemyTemplate,
        position: new THREE.Vector3(x, y, z),
        experience: this.experience
      })

      enemy.delayActivation = 1.0 + i * 0.5
      this.enemies.push(enemy)
    }
  }

  toggleAudio() {
    this.ambientSound.toggle()
  }

  update(delta) {
    this.fox?.update()
    this.robot?.update()
    this.blockPrefab?.update()

    // 🧟‍♂️ Enemigos activos solo si el juego ya comenzó
    if (this.gameStarted && !this.gameEnded) {
      this.enemies?.forEach(e => e.update(delta))

      // 💀 Verificar derrota
      const distToClosest = this.enemies?.reduce((min, e) => {
        if (!e?.body?.position || !this.robot?.body?.position) return min
        const d = e.body.position.distanceTo(this.robot.body.position)
        return Math.min(min, d)
      }, Infinity) ?? Infinity

      if (distToClosest < 1.0 && !this.defeatTriggered) {
        this.defeatTriggered = true
        if (window.userInteracted && this.loseSound) this.loseSound.play()

        const firstEnemy = this.enemies?.[0]
        const enemyMesh = firstEnemy?.model || firstEnemy?.group
        if (enemyMesh) {
          enemyMesh.scale.set(1.3, 1.3, 1.3)
          setTimeout(() => enemyMesh.scale.set(1, 1, 1), 500)
        }

        this.experience.modal.show({
          icon: '💀',
          message: '¡El enemigo te atrapó!\n¿Quieres intentarlo otra vez?',
          buttons: [
            { text: '🔁 Reintentar', onClick: () => this.experience.resetGameToFirstLevel() },
            { text: '❌ Salir',      onClick: () => this.experience.resetGame() }
          ]
        })
        return
      }
    }

    if (this.thirdPersonCamera && this.experience.isThirdPerson && !this.experience.renderer.instance.xr.isPresenting) {
      this.thirdPersonCamera.update()
    }

    this.loader?.prizes?.forEach(p => p.update(delta))
    if (!this.allowPrizePickup || !this.loader || !this.robot || !this.robot.body || this.gameEnded) return

    let pos = null
    if (this.experience.renderer.instance.xr.isPresenting) {
      pos = this.experience.camera.instance.position
    } else if (this.robot?.body?.position) {
      pos = this.robot.body.position
    } else {
      return
    }

    const speed = this.robot?.body?.velocity?.length?.() || 0
    const moved = speed > 0.5

    this.loader.prizes.forEach((prize) => {
      if (!prize.pivot) return
      const dist = prize.pivot.position.distanceTo(pos)

      if (dist < 1.2 && moved && !prize.collected) {
        prize.collect()
        prize.collected = true

        if (prize.role === "default") {
          this.points = (this.points || 0) + 1
          this.robot.points = this.points

          const pointsTarget = this.levelManager.getCurrentLevelTargetPoints()
          console.log(`🎯 Monedas recolectadas: ${this.points} / ${pointsTarget}`)

          // 🏁 FIN DIRECTO EN NIVEL 3 (5 monedas)
          if (this.levelManager.currentLevel === 3 && this.points >= pointsTarget && !this.gameEnded) {
            this._endGameNow()
            return
          }

          // Portales para niveles 1 y 2 como siempre
          if (!this.finalPrizeActivated && this.levelManager.currentLevel !== 3 && this.points === pointsTarget) {
            const finalCoin = this.loader.prizes.find(p => p.role === "finalPrize")
            if (finalCoin && !finalCoin.collected && finalCoin.pivot) {
              finalCoin.pivot.visible = true
              if (finalCoin.model) finalCoin.model.visible = true
              this.finalPrizeActivated = true

              new FinalPrizeParticles({
                scene: this.scene,
                targetPosition: finalCoin.pivot.position,
                sourcePosition: this.robot.body.position,
                experience: this.experience
              })

              // Faro visual
              this._spawnBeacon(finalCoin.pivot.position)
              if (window.userInteracted) this.portalSound.play()
              console.log("🪙 Coin final activado correctamente.")
            }
          }
        }

        if (prize.role === "finalPrize") {
          if (this.levelManager.currentLevel < this.levelManager.totalLevels) {
            this.levelManager.nextLevel()
            this.points = 0
            this.robot.points = 0
          } else {
            // (No se usa en nivel 3 por la finalización directa)
            this._endGameNow()
          }
        }

        if (this.experience.raycaster?.removeRandomObstacles) {
          const reduction = 0.2 + Math.random() * 0.1
          this.experience.raycaster.removeRandomObstacles(reduction)
        }
        if (window.userInteracted) this.coinSound.play()
        this.experience.menu.setStatus?.(`🎖️ Puntos: ${this.points}`)
      }
    })

    // ✅ Auto-activar portal SOLO en niveles 1 y 2
    if (!this.finalPrizeActivated && this.loader?.prizes && this.levelManager.currentLevel !== 3) {
      const totalDefault = this.loader.prizes.filter(p => p.role === 'default').length
      const collectedDefault = this.loader.prizes.filter(p => p.role === 'default' && p.collected).length

      if (totalDefault > 0 && collectedDefault === totalDefault) {
        const finalCoin = this.loader.prizes.find(p => p.role === "finalPrize")
        if (finalCoin && !finalCoin.collected && finalCoin.pivot) {
          finalCoin.pivot.visible = true
          if (finalCoin.model) finalCoin.model.visible = true
          this.finalPrizeActivated = true

          new FinalPrizeParticles({
            scene: this.scene,
            targetPosition: finalCoin.pivot.position,
            sourcePosition: this.experience.vrDolly?.position ?? this.experience.camera.instance.position,
            experience: this.experience
          })

          this._spawnBeacon(finalCoin.pivot.position)
          if (window.userInteracted) this.portalSound.play()
          console.log("🪙 FinalPrize activado automáticamente.")
        }
      }
    }

    // Faro rotación
    if (this.discoRaysGroup) this.discoRaysGroup.rotation.y += delta * 0.5

    // Optimización física por distancia
    const playerPos = this.experience.renderer.instance.xr.isPresenting
      ? this.experience.camera.instance.position
      : this.robot?.body?.position

    this.scene.traverse((obj) => {
      if (obj.userData?.levelObject && obj.userData.physicsBody) {
        const dist = obj.position.distanceTo(playerPos)
        const shouldEnable = dist < 40 && obj.visible

        const body = obj.userData.physicsBody
        if (shouldEnable && !body.enabled) body.enabled = true
        else if (!shouldEnable && body.enabled) body.enabled = false
      }
    })
  }

  _spawnBeacon(targetPos) {
    this.discoRaysGroup = new THREE.Group()
    this.scene.add(this.discoRaysGroup)

    const rayMaterial = new THREE.MeshBasicMaterial({
      color: 0xaa00ff,
      transparent: true,
      opacity: 0.25,
      side: THREE.DoubleSide
    })

    const rayCount = 4
    for (let i = 0; i < rayCount; i++) {
      const cone = new THREE.ConeGeometry(0.2, 4, 6, 1, true)
      const ray = new THREE.Mesh(cone, rayMaterial)
      ray.position.set(0, 2, 0)
      ray.rotation.x = Math.PI / 2
      ray.rotation.z = (i * Math.PI * 2) / rayCount

      const spot = new THREE.SpotLight(0xaa00ff, 2, 12, Math.PI / 7, 0.2, 0.5)
      spot.castShadow = false
      spot.shadow.mapSize.set(1, 1)
      spot.position.copy(ray.position)
      spot.target.position.set(
        Math.cos(ray.rotation.z) * 10,
        2,
        Math.sin(ray.rotation.z) * 10
      )

      ray.userData.spot = spot
      this.discoRaysGroup.add(ray)
      this.discoRaysGroup.add(spot)
      this.discoRaysGroup.add(spot.target)
    }

    this.discoRaysGroup.position.copy(targetPos)
  }

  _endGameNow() {
    if (this.gameEnded) return
    this.gameEnded = true
    const elapsed = this.experience.tracker.stop()
    this.experience.tracker.saveTime(elapsed)
    this.experience.tracker.showEndGameModal(elapsed)

    this.experience.obstacleWavesDisabled = true
    clearTimeout(this.experience.obstacleWaveTimeout)
    this.experience.raycaster?.removeAllObstacles?.()

    if (window.userInteracted) this.winner.play()
  }

  async loadLevel(level) {
    try {
      const FRONTEND_ONLY = String(import.meta.env.VITE_FRONTEND_ONLY || '').toLowerCase() === 'true'
      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
      const apiUrl = `${backendUrl}/api/blocks?level=${level}`;

      const publicPath = (p) => {
        const base = import.meta.env.BASE_URL || '/';
        return `${base.replace(/\/$/, '')}/${p.replace(/^\//, '')}`;
      };

      // Archivos locales por nivel
      const fallbackByLevel = {
        1: 'data/toy_car_blocks1.json',
        2: 'data/toy_car_blocks2.json',
        3: 'data/toy_car_blocks3.json'
      };
      const localUrl = publicPath(fallbackByLevel[level] || fallbackByLevel[1]);

      const parseJsonResponse = async (res, label='') => {
        if (!res.ok) {
          const preview = (await res.text()).slice(0, 200)
          throw new Error(`HTTP ${res.status} en ${label}. Vista previa: ${preview}`)
        }
        const ct = (res.headers.get('content-type') || '').toLowerCase()
        if (!ct.includes('application/json')) {
          const preview = (await res.text()).slice(0, 200)
          throw new Error(`Contenido no JSON en ${label}. Vista previa: ${preview}`)
        }
        return res.json()
      }

      let data;

      if (FRONTEND_ONLY) {
        const localRes = await fetch(localUrl, { cache: 'no-store' })
        const payload = await parseJsonResponse(localRes, `LOCAL ${localUrl}`)
        const blocks = Array.isArray(payload) ? payload : (payload.blocks || []).filter(b => b.level === level)
        data = { blocks, spawnPoint: payload.spawnPoint || { x: -17, y: 1.5, z: -67 } }
      } else {
        try {
          const res = await fetch(apiUrl, { cache: 'no-store' });
          data = await parseJsonResponse(res, `API ${apiUrl}`)
          console.log(`📦 Datos del nivel ${level} cargados desde API`);
        } catch (error) {
          console.warn(`⚠️ No se pudo conectar con la API. Fallback local nivel ${level}...`);
          const localRes = await fetch(localUrl, { cache: 'no-store' })
          const payload = await parseJsonResponse(localRes, `LOCAL ${localUrl}`)
          const blocks = Array.isArray(payload) ? payload : (payload.blocks || []).filter(b => b.level === level)
          data = { blocks, spawnPoint: payload.spawnPoint || { x: -17, y: 1.5, z: -67 } }
        }
      }

      const spawnPoint = data.spawnPoint || { x: 5, y: 1.5, z: 5 }
      this.currentSpawnPoint = { ...spawnPoint }

      // Reset de estado del nivel
      this.points = 0;
      this.gameEnded = false;
      this.defeatTriggered = false;
      if (this.robot) this.robot.points = 0;
      this.finalPrizeActivated = false;
      this.experience.menu.setStatus?.(`🎖️ Puntos: ${this.points}`);

      // Precise
      const preciseUrl = publicPath('config/precisePhysicsModels.json');
      const preciseRes = await fetch(preciseUrl, { cache: 'no-store' });
      const ct = (preciseRes.headers.get('content-type') || '').toLowerCase();
      if (!preciseRes.ok || !ct.includes('application/json')) {
        const preview = (await preciseRes.text()).slice(0, 200);
        throw new Error(`Precise no JSON/HTTP en ${preciseUrl}. Vista previa: ${preview}`);
      }
      const preciseModels = await preciseRes.json();

      // Procesar bloques
      if (data.blocks) {
        this.loader._processBlocks(data.blocks, preciseModels);
        this.loader._lastBlocks = data.blocks; // debug
      } else {
        await this.loader.loadFromURL(apiUrl);
      }

      // --- Asegurar finalPrize SOLO si no es nivel 3 (porque aquí terminamos por monedas) ---
      if (this.levelManager.currentLevel !== 3) {
        let finalPrize = this.loader.prizes.find(p => p.role === 'finalPrize');
        if (!finalPrize) {
          const spawn = new THREE.Vector3(
            (this.currentSpawnPoint?.x ?? 0),
            (this.currentSpawnPoint?.y ?? 0),
            (this.currentSpawnPoint?.z ?? 0)
          );
          let candidate = null;
          let minDist = Infinity;
          this.loader.prizes.forEach(p => {
            if (p.role === 'default' && p.pivot) {
              const d = p.pivot.position.distanceTo(spawn);
              if (d < minDist) { minDist = d; candidate = p; }
            }
          });
          if (candidate) {
            candidate.role = 'finalPrize';
            if (candidate.pivot) candidate.pivot.visible = false;
            if (candidate.model) candidate.model.visible = false;
            console.log('🪙 Promovida una default a finalPrize (fallback).');
          } else {
            console.warn('⚠️ No hay monedas default para promover a finalPrize.');
          }
        }
      } else {
        // Nivel 3: asegurarse de que cualquier finalPrize no estorbe
        this.loader.prizes.forEach(p => {
          if (p.role === 'finalPrize') {
            if (p.pivot) p.pivot.visible = false;
            if (p.model) p.model.visible = false;
          }
        });
      }

      // Estado visual de premios
      this.loader.prizes.forEach(p => {
        if (p.model) p.model.visible = (p.role !== 'finalPrize')
        p.collected = false
      })

      // Conteo real de monedas default
      this.totalDefaultCoins = this.loader.prizes.filter(p => p.role === "default").length
      console.log(`🎯 Total de monedas default para el nivel ${level}: ${this.totalDefaultCoins}`)

      // Reubica al jugador en el spawn del nivel
      this.resetRobotPosition(spawnPoint)
      console.log(`✅ Nivel ${level} cargado con spawn en`, spawnPoint)

      // 🧨 Respawn de enemigos por nivel
      const enemiesCountEnv = parseInt(import.meta.env.VITE_ENEMIES_COUNT || '3', 10)
      const enemiesCount = Number.isFinite(enemiesCountEnv) && enemiesCountEnv > 0 ? enemiesCountEnv : 3
      this.spawnEnemies(enemiesCount)

    } catch (error) {
      console.error('❌ Error cargando nivel:', error);
    }
  }

  clearCurrentScene() {
    if (!this.experience || !this.scene || !this.experience.physics || !this.experience.physics.world) {
      console.warn('⚠️ No se puede limpiar: sistema de físicas no disponible.');
      return;
    }

    let visualObjectsRemoved = 0;
    let physicsBodiesRemoved = 0;

    const childrenToRemove = [];

    this.scene.children.forEach((child) => {
      if (child.userData && child.userData.levelObject) {
        childrenToRemove.push(child);
      }
    })

    childrenToRemove.forEach((child) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach(mat => mat.dispose());
        } else {
          child.material.dispose();
        }
      }

      this.scene.remove(child);

      if (child.userData.physicsBody) {
        this.experience.physics.world.removeBody(child.userData.physicsBody);
      }

      visualObjectsRemoved++;
    });

    let physicsBodiesRemaining = -1;

    if (this.experience.physics && this.experience.physics.world && Array.isArray(this.experience.physics.bodies)) {
      const survivingBodies = [];
      let bodiesBefore = this.experience.physics.bodies.length;

      this.experience.physics.bodies.forEach((body) => {
        if (body.userData && body.userData.levelObject) {
          this.experience.physics.world.removeBody(body)
          physicsBodiesRemoved++
        } else {
          survivingBodies.push(body)
        }
      });

      this.experience.physics.bodies = survivingBodies;

      console.log(`🧹 Physics Cleanup Report:`);
      console.log(`✅ Cuerpos físicos eliminados: ${physicsBodiesRemoved}`);
      console.log(`🎯 Cuerpos físicos sobrevivientes: ${survivingBodies.length}`);
      console.log(`📦 Estado inicial: ${bodiesBefore} cuerpos → Estado final: ${survivingBodies.length} cuerpos`);
    } else {
      console.warn('⚠️ Physics system no disponible o sin cuerpos activos, omitiendo limpieza física.');
    }

    console.log(`🧹 Escena limpiada antes de cargar el nuevo nivel.`);
    console.log(`✅ Objetos 3D eliminados: ${visualObjectsRemoved}`);
    console.log(`✅ Cuerpos físicos eliminados: ${physicsBodiesRemoved}`);
    console.log(`🎯 Objetos 3D actuales en escena: ${this.scene.children.length}`);

    if (physicsBodiesRemaining !== -1) {
      console.log(`🎯 Cuerpos físicos actuales en Physics World: ${physicsBodiesRemaining}`);
    }

    if (this.loader && this.loader.prizes.length > 0) {
      this.loader.prizes.forEach(prize => {
        if (prize.model) {
          this.scene.remove(prize.model);
          if (prize.model.geometry) prize.model.geometry.dispose();
          if (prize.model.material) {
            if (Array.isArray(prize.model.material)) {
              prize.model.material.forEach(mat => mat.dispose());
            } else {
              prize.model.material.dispose();
            }
          }
        }
      });
      this.loader.prizes = [];
      console.log('🎯 Premios del nivel anterior eliminados correctamente.');
    }

    this.finalPrizeActivated = false
    this.loader?.prizes?.forEach(p => {
      if (p.role === "finalPrize" && p.pivot) {
        p.pivot.visible = false;
        if (p.model) p.model.visible = false;
        p.collected = false;
      }
    })

    // Faro cleanup
    if (this.discoRaysGroup) {
      this.discoRaysGroup.children.forEach(obj => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) obj.material.dispose();
      });
      this.scene.remove(this.discoRaysGroup);
      this.discoRaysGroup = null;
    }
  }

  resetRobotPosition(spawn = { x: -17, y: 1.5, z: -67 }) {
    if (!this.robot?.body || !this.robot?.group) return

    this.robot.body.position.set(spawn.x, spawn.y, spawn.z)
    this.robot.body.velocity.set(0, 0, 0)
    this.robot.body.angularVelocity.set(0, 0, 0)
    this.robot.body.quaternion.setFromEuler(0, 0, 0)

    this.robot.group.position.set(spawn.x, spawn.y, spawn.z)
    this.robot.group.rotation.set(0, 0, 0)
  }

  async _processLocalBlocks(blocks) {
    const preciseRes = await fetch('/config/precisePhysicsModels.json');
    const preciseModels = await preciseRes.json();
    this.loader._processBlocks(blocks, preciseModels);

    this.loader.prizes.forEach(p => {
      if (p.model) p.model.visible = (p.role !== 'finalPrize');
      p.collected = false;
    });

    this.totalDefaultCoins = this.loader.prizes.filter(p => p.role === "default").length;
    console.log(`🎯 Total de monedas default para el nivel local: ${this.totalDefaultCoins}`);
  }

  _checkVRMode() {
    const isVR = this.experience.renderer.instance.xr.isPresenting

    if (isVR) {
      if (this.robot?.group) this.robot.group.visible = false
      if (this.enemy) this.enemy.delayActivation = 10.0
      this.experience.camera.instance.position.set(5, 1.6, 5)
      this.experience.camera.instance.lookAt(new THREE.Vector3(5, 1.6, 4))
    } else {
      if (this.robot?.group) this.robot.group.visible = true
    }
  }
}
