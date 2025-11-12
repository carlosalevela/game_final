// FinalPrizeParticles.js – FX con vórtices, teletransporte y luces
import * as THREE from 'three'

export default class FinalPrizeParticles {
  constructor({ scene, targetPosition, sourcePosition, experience }) {
    this.scene = scene
    this.experience = experience
    this.clock = new THREE.Clock()

    // ------------------ Partículas base (tu lógica original) ------------------
    this.count = 60
    this.angles = new Float32Array(this.count)
    this.radii = new Float32Array(this.count)
    this.positions = new Float32Array(this.count * 3)

    for (let i = 0; i < this.count; i++) {
      const i3 = i * 3
      const angle = Math.random() * Math.PI * 2
      const radius = 2 + Math.random() * 2
      const y = Math.random() * 2
      this.angles[i] = angle
      this.radii[i] = radius
      this.positions[i3 + 0] = sourcePosition.x + Math.cos(angle) * radius
      this.positions[i3 + 1] = sourcePosition.y + y
      this.positions[i3 + 2] = sourcePosition.z + Math.sin(angle) * radius
    }

    this.geometry = new THREE.BufferGeometry()
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3))

    this.pointsMaterial = new THREE.PointsMaterial({
      size: 0.28,
      color: 0xffff66,
      transparent: true,
      opacity: 0.95,
      sizeAttenuation: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    })

    this.points = new THREE.Points(this.geometry, this.pointsMaterial)
    this.scene.add(this.points)

    // ------------------ Efectos nuevos ------------------
    this.target = targetPosition.clone()

    // Luz pulsante cerca del objetivo
    this.light = new THREE.PointLight(0x88ccff, 1.2, 8, 2.0) // color, intensidad, distancia, decay
    this.light.position.copy(this.target).add(new THREE.Vector3(0, 1.2, 0))
    this.scene.add(this.light)
    this.baseLightIntensity = 1.2
    this.lightPulseT = 0

    // Portal (disco) con shader sencillo radial (alpha hacia el borde)
    const portalGeom = new THREE.RingGeometry(0.6, 2.6, 64, 1)
    this.portalMaterial = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        u_time: { value: 0 },
        u_alpha: { value: 0.9 },
        u_color: { value: new THREE.Color(0x44ccff) }
      },
      vertexShader: /* glsl */`
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */`
        varying vec2 vUv;
        uniform float u_time;
        uniform float u_alpha;
        uniform vec3 u_color;
        // anillo energético con ondas
        void main() {
          float r = vUv.y;               // 0..1 del inner al outer en RingGeometry
          float glow = smoothstep(0.0, 0.25, 1.0 - r);
          float waves = 0.5 + 0.5 * sin(20.0 * r - u_time * 6.0);
          float alpha = (glow * 0.6 + waves * 0.4) * u_alpha;
          // desvanecer en el borde externo
          alpha *= smoothstep(1.0, 0.7, r);
          // y no mostrar el centro hueco (ring)
          if (r < 0.02) discard;
          vec3 col = u_color * (0.7 + 0.3 * sin(u_time * 3.0));
          gl_FragColor = vec4(col, alpha);
        }
      `
    })
    this.portal = new THREE.Mesh(portalGeom, this.portalMaterial)
    this.portal.rotation.x = -Math.PI * 0.5
    this.portal.position.copy(this.target).add(new THREE.Vector3(0, 0.05, 0))
    this.scene.add(this.portal)

    // Vórtices dobles (anillos espirales con LineLoop)
    this.vortex1 = this._createVortex(2.8, 1.2, 120, 0x66aaff)
    this.vortex2 = this._createVortex(2.0, 0.6, 90, 0xffee88)
    this.vortexGroup = new THREE.Group()
    this.vortexGroup.add(this.vortex1, this.vortex2)
    this.vortexGroup.position.copy(this.target)
    this.scene.add(this.vortexGroup)

    // Onda de choque (plano circular que se expande)
    const shockGeom = new THREE.CircleGeometry(0.5, 64)
    this.shockMaterial = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        u_time: { value: 0 },
        u_alpha: { value: 0.0 },
        u_color: { value: new THREE.Color(0x88ddff) },
        u_radius: { value: 0.5 }
      },
      vertexShader: /* glsl */`
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */`
        varying vec2 vUv;
        uniform float u_alpha;
        uniform vec3 u_color;
        uniform float u_radius;
        // borde más brillante, centro transparente
        void main() {
          vec2 uv = vUv * 2.0 - 1.0;
          float d = length(uv);
          float edge = smoothstep(u_radius, u_radius - 0.05, d); // línea fina
          float alpha = edge * u_alpha;
          if (alpha < 0.01) discard;
          gl_FragColor = vec4(u_color, alpha);
        }
      `
    })
    this.shock = new THREE.Mesh(shockGeom, this.shockMaterial)
    this.shock.rotation.x = -Math.PI * 0.5
    this.shock.position.copy(this.target).add(new THREE.Vector3(0, 0.02, 0))
    this.scene.add(this.shock)
    this.shockVisible = false
    this.shock.visible = false

    // Estado de teletransporte
    this.collected = false
    this.collectT = 0 // tiempo desde que se recoge

    // Suscripción al ticker
    this.experience.time.on('tick', this.update)

    // Autodestruir si nunca se recoge (seguridad)
    this._autoDisposeTimeout = setTimeout(() => this.dispose(), 12000)
  }

  // --------- Helpers de geometría FX ----------
  _createVortex(radius = 2.5, height = 1.0, segments = 100, color = 0xffffff) {
    const pos = new Float32Array(segments * 3)
    for (let i = 0; i < segments; i++) {
      const t = i / segments
      const ang = t * Math.PI * 2.0 * 2.0 // dos vueltas
      const r = radius * (0.9 + 0.1 * Math.sin(i * 0.3))
      const x = Math.cos(ang) * r
      const z = Math.sin(ang) * r
      const y = (t - 0.5) * height
      const i3 = i * 3
      pos[i3 + 0] = x
      pos[i3 + 1] = y
      pos[i3 + 2] = z
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    const m = new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    })
    const loop = new THREE.LineLoop(g, m)
    return loop
  }

  // --------- API para que llames al coger el premio ----------
  collect() {
    if (this.collected) return
    this.collected = true
    this.collectT = 0

    // Mostrar shockwave y subir alpha
    this.shockVisible = true
    this.shock.visible = true
    this.shockMaterial.uniforms.u_alpha.value = 1.0
    this.shockMaterial.uniforms.u_radius.value = 0.2

    // Flash de luz
    this.light.intensity = 5.0

    // Boost a las partículas: que salgan hacia arriba rápidamente
    this._burstUp = true

    // Acortar el TTL total tras recoger
    clearTimeout(this._autoDisposeTimeout)
    this._autoDisposeTimeout = setTimeout(() => this.dispose(), 3500)
  }

  // --------- Update principal ----------
  update = () => {
    const delta = this.clock.getDelta()
    const t = this.clock.elapsedTime

    // Portal anim
    this.portalMaterial.uniforms.u_time.value = t
    // rotación lenta del portal
    this.portal.rotation.z += 0.6 * delta

    // Vórtices giran en sentidos opuestos
    this.vortex1.rotation.y += 0.8 * delta
    this.vortex2.rotation.y -= 1.0 * delta
    // “respiración” vertical
    this.vortexGroup.position.y = this.target.y + Math.sin(t * 2.0) * 0.05

    // Luz: pulso suave si no se ha recogido; flash y decaimiento si sí
    this.lightPulseT += delta
    if (!this.collected) {
      const pulse = 0.5 + 0.5 * Math.sin(this.lightPulseT * 3.0)
      this.light.intensity = this.baseLightIntensity * (0.8 + 0.4 * pulse)
    } else {
      this.light.intensity = THREE.MathUtils.lerp(this.light.intensity, 0.0, 2.5 * delta)
    }

    // Partículas (tu espiral hacia el target)
    for (let i = 0; i < this.count; i++) {
      const i3 = i * 3
      this.angles[i] += 1.5 * delta
      this.radii[i] *= 0.985
      this.positions[i3 + 0] = this.target.x + Math.cos(this.angles[i]) * this.radii[i]
      this.positions[i3 + 2] = this.target.z + Math.sin(this.angles[i]) * this.radii[i]
      // subir lentamente o burst al recoger
      if (this._burstUp) {
        this.positions[i3 + 1] += 2.0 * delta // subida rápida
      } else {
        this.positions[i3 + 1] += 0.012
      }
    }
    this.geometry.attributes.position.needsUpdate = true

    // Efectos cuando se recoge
    if (this.collected) {
      this.collectT += delta

      // Encoger y desvanecer portal
      this.portal.scale.multiplyScalar(Math.max(0.0, 1.0 - 0.9 * delta))
      this.portalMaterial.uniforms.u_alpha.value = Math.max(0.0, this.portalMaterial.uniforms.u_alpha.value - 0.8 * delta)

      // Expandir shockwave y desvanecerla
      if (this.shockVisible) {
        const r = this.shockMaterial.uniforms.u_radius.value
        this.shockMaterial.uniforms.u_radius.value = r + 2.2 * delta
        const a = this.shockMaterial.uniforms.u_alpha.value
        this.shockMaterial.uniforms.u_alpha.value = Math.max(0.0, a - 0.6 * delta)
        if (this.shockMaterial.uniforms.u_alpha.value <= 0.01) {
          this.shockVisible = false
          this.shock.visible = false
        }
      }

      // Desvanecer partículas
      this.pointsMaterial.opacity = Math.max(0.0, this.pointsMaterial.opacity - 0.9 * delta)
      // Desvanecer vórtices
      this.vortex1.material.opacity = Math.max(0.0, this.vortex1.material.opacity - 0.7 * delta)
      this.vortex2.material.opacity = Math.max(0.0, this.vortex2.material.opacity - 0.7 * delta)
    }
  }

  // --------- Limpieza ----------
  dispose() {
    this.experience.time.off('tick', this.update)
    clearTimeout(this._autoDisposeTimeout)

    // Quitar de escena
    this.scene.remove(this.points)
    this.scene.remove(this.portal)
    this.scene.remove(this.vortexGroup)
    this.scene.remove(this.shock)
    this.scene.remove(this.light)

    // Geometrías / materiales
    this.geometry.dispose()
    this.pointsMaterial.dispose()

    this.portal.geometry.dispose()
    this.portalMaterial.dispose()

    this.vortex1.geometry.dispose()
    this.vortex1.material.dispose()
    this.vortex2.geometry.dispose()
    this.vortex2.material.dispose()

    this.shock.geometry.dispose()
    this.shockMaterial.dispose()
  }
}
