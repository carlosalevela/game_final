// Enemy.js
import * as THREE from 'three'
import * as CANNON from 'cannon-es'
import FinalPrizeParticles from '../Experience/Utils/FinalPrizeParticles.js'
import Sound from './Sound.js'

export default class Enemy {
  constructor({ scene, physicsWorld, playerRef, model, animations = [], position, experience }) {
    this.experience = experience
    this.scene = scene
    this.physicsWorld = physicsWorld
    this.playerRef = playerRef
    this.baseSpeed = 0.5
    this.speed = this.baseSpeed
    this.delayActivation = 0

    // ---- AUDIO PROXIMIDAD ----
    this.proximitySound = new Sound('/sounds/zombie_loop.mp3', { loop: true, volume: 0 })
    this._soundCooldown = 0
    this.proximitySound.play()

    // ---- MODELO VISUAL ----
    this.model = model // ya debe venir clonado afuera
    this.model.position.copy(position)
    this.scene.add(this.model)

    // ---- ANIMACIONES ----
    this.mixer = new THREE.AnimationMixer(this.model)
    this.actions = {}
    animations.forEach((clip) => {
      this.actions[clip.name] = this.mixer.clipAction(clip)
    })

    // Intenta mapear nombres típicos
    this.idle = this.actions['Idle'] || this.actions['idle'] || this.actions['Breathing Idle']
    this.walk = this.actions['Walk'] || this.actions['Walking'] || this.actions['walk']
    this.run  = this.actions['Run']  || this.actions['Running'] || this.actions['run']
    this.attack = this.actions['Attack'] || this.actions['attack'] || this.actions['Attack_01']

    // Estado actual
    this.currentAction = null
    this.play(this.idle || this.walk)

    // ---- FÍSICA ----
    const enemyMaterial = new CANNON.Material('enemyMaterial')
    enemyMaterial.friction = 0.0

    // Si tu zombi es alto/estrecho, una cápsula sería ideal; con Cannon-es puro usamos sphere aprox:
    const shape = new CANNON.Sphere(0.5)
    this.body = new CANNON.Body({
      mass: 5,
      shape,
      material: enemyMaterial,
      position: new CANNON.Vec3(position.x, position.y, position.z),
      linearDamping: 0.01
    })

    if (this.playerRef?.body) {
      this.body.position.y = this.playerRef.body.position.y
      this.model.position.y = this.body.position.y
    }

    this.body.sleepSpeedLimit = 0.0
    this.body.wakeUp()
    this.physicsWorld.addBody(this.body)
    this.model.userData.physicsBody = this.body

    // ---- COLISIÓN CON JUGADOR ----
    this._onCollide = (event) => {
      if (event.body === this.playerRef.body) {
        if (typeof this.playerRef.die === 'function') this.playerRef.die()
        if (this.proximitySound) this.proximitySound.stop()

        if (this.model.parent) {
          new FinalPrizeParticles({
            scene: this.scene,
            targetPosition: this.body.position,
            sourcePosition: this.body.position,
            experience: this.experience
          })
          this.play(this.attack || this.run) // pequeña señal visual
          this.destroy()
        }
      }
    }
    this.body.addEventListener('collide', this._onCollide)
  }

  // Cambia de animación con crossfade suave
  play(action) {
    if (!action) return
    if (this.currentAction === action) return
    action.reset().play()
    if (this.currentAction) {
      this.currentAction.crossFadeTo(action, 0.25, false)
    }
    this.currentAction = action
  }

  update(delta) {
    if (this.delayActivation > 0) {
      this.delayActivation -= delta
      return
    }

    if (!this.body || !this.playerRef?.body) return

    const targetPos = new CANNON.Vec3(
      this.playerRef.body.position.x,
      this.playerRef.body.position.y,
      this.playerRef.body.position.z
    )
    const enemyPos = this.body.position

    // ---- Sonido por cercanía + velocidad ----
    const distance = enemyPos.distanceTo(targetPos)
    this.speed = (distance < 4) ? 2.5 : this.baseSpeed

    const maxDistance = 10
    const clamped = Math.min(distance, maxDistance)
    const proximityVolume = 1 - (clamped / maxDistance)
    this.proximitySound?.setVolume(proximityVolume * 0.4)

    // ---- Movimiento hacia el jugador ----
    const dir = new CANNON.Vec3(
      targetPos.x - enemyPos.x,
      targetPos.y - enemyPos.y,
      targetPos.z - enemyPos.z
    )

    if (dir.length() > 0.5) {
      dir.normalize()
      dir.scale(this.speed, dir)
      this.body.velocity.x = dir.x
      this.body.velocity.y = dir.y
      this.body.velocity.z = dir.z

      // Rotar el modelo para mirar al jugador (solo Y)
      const lookAt = new THREE.Vector3(targetPos.x, this.model.position.y, targetPos.z)
      this.model.lookAt(lookAt)

      // Elegir animación de locomoción
      if (this.run && this.speed >= 2.0) this.play(this.run)
      else if (this.walk) this.play(this.walk)
    } else {
      // Muy cerca -> idle o ataque, como prefieras
      if (this.attack && distance < 1.2) this.play(this.attack)
      else if (this.idle) this.play(this.idle)
      this.body.velocity.set(0, this.body.velocity.y, 0)
    }

    // ---- Animations ----
    if (this.mixer) this.mixer.update(delta)

    // ---- Sincroniza modelo con física ----
    this.model.position.copy(this.body.position)
  }

  destroy() {
    if (this.model) {
      this.scene.remove(this.model)
    }
    if (this.proximitySound) this.proximitySound.stop()
    if (this.body) {
      this.body.removeEventListener('collide', this._onCollide)
      if (this.physicsWorld.bodies.includes(this.body)) {
        this.physicsWorld.removeBody(this.body)
      }
      this.body = null
    }
  }
}
