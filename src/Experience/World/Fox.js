import * as THREE from 'three'

export default class Fox {
    constructor(experience) {
        this.experience = experience
        this.scene = this.experience.scene
        this.resources = this.experience.resources
        this.time = this.experience.time
        this.debug = this.experience.debug

        // Debug
        if (this.debug.active) {
            this.debugFolder = this.debug.ui.addFolder('fox')
        }

        // Resource
        this.resource = this.resources.items.foxModel

        this.setModel()
        this.setAnimation()
    }

    setModel() {
        this.model = this.resource.scene
        this.model.scale.set(0.010, 0.010, 0.010)
        this.model.position.set(-2, 0, -2) // aparece un poco detrás del robot
        this.scene.add(this.model)
        //Activando la sobra de fox
        this.model.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                child.castShadow = true
            }
        })
    }
    //Manejo GUI
    setAnimation() {
        this.animation = {}

        // Mixer
        this.animation.mixer = new THREE.AnimationMixer(this.model)

        // Actions
        this.animation.actions = {}

        this.animation.actions.idle = this.animation.mixer.clipAction(this.resource.animations[0])
        this.animation.actions.walking = this.animation.mixer.clipAction(this.resource.animations[1])
        this.animation.actions.running = this.animation.mixer.clipAction(this.resource.animations[2])

        this.animation.actions.current = this.animation.actions.idle
        this.animation.actions.current.play()

        // Play the action
        this.animation.play = (name) => {
            const newAction = this.animation.actions[name]
            const oldAction = this.animation.actions.current

            newAction.reset()
            newAction.play()
            newAction.crossFadeFrom(oldAction, 1)

            this.animation.actions.current = newAction
        }

        // Debug
        if (this.debug.active) {
            const debugObject = {
                playIdle: () => { this.animation.play('idle') },
                playWalking: () => { this.animation.play('walking') },
                playRunning: () => { this.animation.play('running') }
            }
            this.debugFolder.add(debugObject, 'playIdle')
            this.debugFolder.add(debugObject, 'playWalking')
            this.debugFolder.add(debugObject, 'playRunning')
        }
    }
    followRobot(robot, delta) {
        if (!robot?.group || !this.model) return;

        const foxPos = this.model.position;
        const robotPos = robot.group.position.clone();

        // 📏 Calcular dirección al robot
        const direction = new THREE.Vector3().subVectors(robotPos, foxPos);
        const distance = direction.length();

        // 🔹 Mantener distancia deseada
        const desiredDistance = 2.5; // detrás del robot
        const followSpeed = 2.5; // velocidad base
        const stopThreshold = 0.3; // margen para detener animación

        direction.normalize();

        // 🐾 Si está lejos, moverse hacia el robot
        if (distance > desiredDistance) {
            const moveStep = Math.min((distance - desiredDistance) * 0.05, followSpeed * delta);
            foxPos.addScaledVector(direction, moveStep);

            // 🔄 Rotación suave hacia el robot
            const targetRotation = Math.atan2(direction.x, direction.z);
            this.model.rotation.y += (targetRotation - this.model.rotation.y) * 0.1;

            // 🎬 Cambiar animación a caminar
            if (this.animation.actions.current !== this.animation.actions.walking) {
                this.animation.play('walking');
            }
        } else if (distance > desiredDistance - stopThreshold && distance < desiredDistance + stopThreshold) {
            // 🎬 Cambiar animación a idle si ya está cerca
            if (this.animation.actions.current !== this.animation.actions.idle) {
                this.animation.play('idle');
            }
        }

        // 📦 Mantener al nivel del suelo
        this.model.position.y = robot.group.position.y;
    }


    update() {
    const delta = this.time.delta * 0.001;

    // 🦊 Seguir al robot principal
    const robot = this.experience.world?.robot;
    if (robot) {
        this.followRobot(robot, delta);
    }

    // 🎞️ Actualizar animaciones
    this.animation.mixer.update(delta);
}

}