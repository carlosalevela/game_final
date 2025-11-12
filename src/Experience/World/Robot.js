import * as THREE from 'three'
import * as CANNON from 'cannon-es'
import Sound from './Sound.js'

export default class Robot {
  constructor(experience) {
    this.experience = experience
    this.scene = this.experience.scene
    this.resources = this.experience.resources
    this.time = this.experience.time
    this.physics = this.experience.physics
    this.keyboard = this.experience.keyboard
    this.debug = this.experience.debug
    this.points = 0

    this.setModel()
    this.setSounds()
    this.setPhysics()
    this.setAnimation()
  }

  // ————————————————————————————————————————————————————
  // MODELO
  // Intenta cargar el recurso del personaje sin importar el nombre de la clave
  // (por compatibilidad: robotModel, nineModel, characterModel, etc.)
  // ————————————————————————————————————————————————————
  setModel() {
    const items = this.resources.items || {}

    // prueba varias claves comunes
    const modelResource =
      items.robotModel ||
      items.nineModel ||
      items.characterModel ||
      items.playerModel ||
      items.avatarModel

    if (!modelResource || !modelResource.scene) {
      throw new Error(
        '[Robot] No se encontró el recurso del modelo (scene). Asegúrate de registrar el FBX/GLTF en resources.items'
      )
    }

    this.modelResource = modelResource
    this.model = modelResource.scene
    this.model.scale.set(0.9, 0.9, 0.9)
    this.model.position.set(0, -0.1, 0) // Centrar respecto al cuerpo físico

    this.group = new THREE.Group()
    this.group.add(this.model)
    this.scene.add(this.group)

    this.model.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true
      }
    })
  }

  // ————————————————————————————————————————————————————
  // FÍSICA
  // ————————————————————————————————————————————————————
  setPhysics() {
    //const shape = new CANNON.Box(new CANNON.Vec3(0.3, 0.5, 0.3))
    const shape = new CANNON.Sphere(0.4)

    this.body = new CANNON.Body({
      mass: 2,
      shape: shape,
      //position: new CANNON.Vec3(4, 1, 0),
      position: new CANNON.Vec3(0, 1.2, 0),
      linearDamping: 0.05,
      angularDamping: 0.9
    })

    this.body.angularFactor.set(0, 1, 0)

    // Estabilización inicial
    this.body.velocity.setZero()
    this.body.angularVelocity.setZero()
    this.body.sleep()
    this.body.material = this.physics.robotMaterial

    this.physics.world.addBody(this.body)

    // Activar cuerpo después de unos ticks
    setTimeout(() => {
      if (this.body) this.body.wakeUp()
    }, 100)
  }

  // ————————————————————————————————————————————————————
  // SONIDOS
  // ————————————————————————————————————————————————————
  setSounds() {
    this.walkSound = new Sound('/sounds/robot/walking.mp3', { loop: true, volume: 0.5 })
    this.jumpSound = new Sound('/sounds/robot/jump.mp3', { volume: 0.8 })
  }

  // ————————————————————————————————————————————————————
  // ANIMACIÓN (usa clips Snc_ y nombres con tuberías Nine|...|Snc_X|Base Layer)
  // ————————————————————————————————————————————————————
  setAnimation() {
    this.animation = {}
    this.animation.mixer = new THREE.AnimationMixer(this.model)
    this.animation.actions = {}

    const clips = this.modelResource.animations || []

    // helper: normaliza el nombre (toma el último segmento tras '|')
    const normalize = (name) => {
      if (!name) return ''
      const parts = name.split('|')
      return parts[parts.length - 1].trim() // p.ej. "Snc_Run" o "Base Layer"
    }

    // helper: busca un clip por varias claves (exacto, substring y normalizado)
    const findClip = (want) => {
      if (!want) return null
      const wantLow = want.toLowerCase()

      // exacto
      let c = clips.find((x) => x.name === want)
      if (c) return c

      // substring
      c = clips.find((x) => x.name?.toLowerCase().includes(wantLow))
      if (c) return c

      // comparar por normalizado (último tramo tras '|')
      c = clips.find((x) => normalize(x.name).toLowerCase() === wantLow)
      if (c) return c

      return null
    }

    // Mapeo a nombres "de juego"
    // Usa tus clips del nuevo personaje:
    const CLIPS = {
      idle: ['Snc_BossIdle', 'Idle'],
      run: ['Snc_Run', 'Run', 'Walking'],
      dash: ['Snc_Dash', 'Dash'],
      death: ['Snc_Death1', 'Snc_Death3', 'Death'],
      recoil: ['Snc_BossRecoil'],
      bank: ['Snc_BossToBank'],
      danceL: ['Snc_Dance1_SwipeLeft'],
      danceU: ['Snc_Dance2_SwipeUp'],
      danceR: ['Snc_Dance3_SwipeRight'],
      danceD: ['Snc_Dance4_SwipeDown']
    }

    // crea las acciones si existen
    for (const key of Object.keys(CLIPS)) {
      const candidates = CLIPS[key]
      let clip = null
      for (const name of candidates) {
        clip = findClip(name)
        if (clip) break
      }
      if (clip) {
        this.animation.actions[key] = this.animation.mixer.clipAction(clip)
      } else {
        console.warn(
          `[Robot] Clip no encontrado para "${key}". Buscado: ${candidates.join(', ')}`
        )
      }
    }

    // acción inicial
    const a = this.animation.actions
    a.current = a.idle || a.run || a.dash || Object.values(a)[0]
    if (a.current) a.current.play()

    // ajustes de loops
    if (a.death) {
      a.death.setLoop(THREE.LoopOnce)
      a.death.clampWhenFinished = true
    }
    if (a.dash) {
      a.dash.setLoop(THREE.LoopOnce)
      a.dash.clampWhenFinished = true
    }

    // helper de crossfade
    this.animation.play = (name, fade = 0.25, reset = true) => {
      const next = this.animation.actions[name]
      if (!next || this.animation.actions.current === next) return
      if (reset) next.reset()
      next.play()
      if (this.animation.actions.current) {
        next.crossFadeFrom(this.animation.actions.current, fade, true)
      }
      this.animation.actions.current = next

      // sonidos
      if (name === 'run') this.walkSound.play()
      else this.walkSound.stop()

      if (name === 'dash') this.jumpSound.play() // opcional: usar SFX de dash
    }
  }

  // ————————————————————————————————————————————————————
  // UPDATE
  // ————————————————————————————————————————————————————
  update() {
    const a = this.animation.actions
    if (a.current === a.death) return

    const delta = this.time.delta * 0.001
    this.animation.mixer.update(delta)

    const keys = this.keyboard.getState()
    const moveForce = 80
    const turnSpeed = 5
    let isMoving = false

    // Limitar velocidad máxima
    const maxSpeed = 20
    this.body.velocity.x = Math.max(Math.min(this.body.velocity.x, maxSpeed), -maxSpeed)
    this.body.velocity.z = Math.max(Math.min(this.body.velocity.z, maxSpeed), -maxSpeed)

    // Dirección hacia adelante, independientemente del salto o movimiento
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(this.group.quaternion)

    // Salto (si lo necesitas con el nuevo personaje)
    if (keys.space && this.body.position.y <= 0.51) {
      this.body.applyImpulse(new CANNON.Vec3(forward.x * 0.5, 3, forward.z * 0.5))
      // si quieres usar un clip de salto distinto, puedes mapearlo aquí
      // this.animation.play('dash') // o un clip de jump si lo tuvieras
      this.jumpSound.play()
      return
    }

    // No permitir que salga del escenario
    if (this.body.position.y > 10) {
      console.warn(' Robot fuera del escenario. Reubicando...')
      this.body.position.set(0, 1.2, 0)
      this.body.velocity.set(0, 0, 0)
    }

    // Movimiento adelante
    if (keys.up) {
      const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(this.group.quaternion)
      this.body.applyForce(new CANNON.Vec3(fwd.x * moveForce, 0, fwd.z * moveForce), this.body.position)
      isMoving = true
    }

    // Movimiento atrás
    if (keys.down) {
      const back = new THREE.Vector3(0, 0, -1).applyQuaternion(this.group.quaternion)
      this.body.applyForce(new CANNON.Vec3(back.x * moveForce, 0, back.z * moveForce), this.body.position)
      isMoving = true
    }

    // Rotación
    if (keys.left) {
      this.group.rotation.y += turnSpeed * delta
      this.body.quaternion.setFromEuler(0, this.group.rotation.y, 0)
    }
    if (keys.right) {
      this.group.rotation.y -= turnSpeed * delta
      this.body.quaternion.setFromEuler(0, this.group.rotation.y, 0)
    }

    // ——— LÓGICA DE ANIMACIÓN ———
    if (isMoving) {
      // Dash si el usuario mantiene Shift y existe el clip
      if ((keys.shift || keys.Shift) && a.dash) {
        if (a.current !== a.dash) {
          // impulso físico breve opcional al entrar en dash:
          const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(this.group.quaternion)
          this.body.applyImpulse(new CANNON.Vec3(fwd.x * 6, 0.5, fwd.z * 6))
          this.animation.play('dash', 0.1)
        }
      } else if (a.run) {
        if (a.current !== a.run) this.animation.play('run')
      } else if (a.walking) {
        if (a.current !== a.walking) this.animation.play('walking')
      }
    } else {
      if (a.idle && a.current !== a.idle) this.animation.play('idle')
    }

    // Sincronizar físico → visual
    this.group.position.copy(this.body.position)
  }

  // ————————————————————————————————————————————————————
  // MUERTE (usa clip death si está)
  // ————————————————————————————————————————————————————
  die() {
    const a = this.animation.actions
    if (a.current === a.death) return

    if (a.current) a.current.fadeOut(0.2)
    if (a.death) a.death.reset().fadeIn(0.2).play()
    a.current = a.death || a.current

    this.walkSound.stop()

    // quitar cuerpo físico
    if (this.body && this.physics.world.bodies.includes(this.body)) {
      this.physics.world.removeBody(this.body)
    }
    this.body = null

    // Ajustes visuales opcionales
    this.group.position.y -= 0.5
    this.group.rotation.x = -Math.PI / 2

    console.log(' Robot ha muerto')
  }

  // ————————————————————————————————————————————————————
  // CONTROL EXTERNO (VR / móvil)
  // ————————————————————————————————————————————————————
  moveInDirection(dir, speed) {
    if (!window.userInteracted || !this.experience.renderer.instance.xr.isPresenting) {
      return
    }

    const mobile = window.experience?.mobileControls
    if (mobile?.intensity > 0) {
      const dir2D = mobile.directionVector
      const dir3D = new THREE.Vector3(dir2D.x, 0, dir2D.y).normalize()

      const adjustedSpeed = 250 * mobile.intensity
      const force = new CANNON.Vec3(dir3D.x * adjustedSpeed, 0, dir3D.z * adjustedSpeed)

      if (this.body) this.body.applyForce(force, this.body.position)

      if (this.animation?.actions?.run && this.animation.actions.current !== this.animation.actions.run) {
        this.animation.play('run')
      }

      // Rotar en dirección de avance
      const angle = Math.atan2(dir3D.x, dir3D.z)
      this.group.rotation.y = angle
      if (this.body) this.body.quaternion.setFromEuler(0, this.group.rotation.y, 0)
    }
  }
}
