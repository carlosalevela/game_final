// Renderer.js
import * as THREE from 'three'

export default class Renderer {
  constructor(experience) {
    this.experience = experience
    this.canvas = this.experience.canvas
    this.sizes = this.experience.sizes
    this.scene = this.experience.scene
    this.camera = this.experience.camera

    // Config de escalado dinámico (puedes ajustar o desactivar con enabled:false)
    this.dynamicScale = {
      enabled: true,
      min: 0.75,
      max: 2.0,
      fpsDown: 45,   // si cae por debajo, baja resolución
      fpsUp: 60,     // si sube por encima, sube resolución
      hysteresis: 0.10 // umbral para aplicar cambios y evitar parpadeos
    }

    this.setInstance()
    this.detectGPUInfo()
  }

  setInstance() {
    this.instance = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: false,
      depth: true,
      stencil: false,
      powerPreference: 'high-performance' // 🔋 pide GPU rápida/dedicada cuando sea posible
    })

    // Sombra (mantén simple; evita soft shadows costosas si no las necesitas)
    this.instance.shadowMap.enabled = true
    // this.instance.shadowMap.type = THREE.PCFSoftShadowMap

    // Tamaño y pixel ratio inicial desde tu gestor de sizes
    this.instance.setSize(this.sizes.width, this.sizes.height)
    this.instance.setPixelRatio(this.sizes.pixelRatio)

    // Tonemapping/encoding (compat r140+)
    // Si usas Three r152+, considera: this.instance.outputColorSpace = THREE.SRGBColorSpace
    this.instance.outputEncoding = THREE.sRGBEncoding
    this.instance.toneMapping = THREE.ACESFilmicToneMapping
    this.instance.toneMappingExposure = 1.3
    this.instance.setClearColor('#fdeac7')

    // Guarda el pixelRatio actual (lo usaremos para escalado dinámico)
    this.currentPixelRatio = this.sizes.pixelRatio
  }

  detectGPUInfo() {
    try {
      const gl = this.instance.getContext()
      const ext = gl.getExtension('WEBGL_debug_renderer_info')
      if (ext) {
        const gpu = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)
        console.log('Renderer (GPU):', gpu)
        if (/swiftshader|software/i.test(gpu)) {
          console.warn('⚠️ Estás en renderizado por software. Activa aceleración por hardware del navegador o del sistema.')
        }
      } else {
        console.log('WEBGL_debug_renderer_info no disponible; no se puede leer el nombre de la GPU.')
      }
    } catch (e) {
      console.warn('No se pudo consultar info de GPU:', e)
    }
  }

  resize() {
    this.instance.setSize(this.sizes.width, this.sizes.height)
    this.instance.setPixelRatio(this.currentPixelRatio ?? this.sizes.pixelRatio)
  }

  update() {
    // 🔧 Escalado dinámico de resolución para mantener FPS (opcional)
    if (this.dynamicScale.enabled) {
      // Si tu Experience tiene time.delta (ms por frame), úsalo; si no, asume ~60FPS
      const dt = (this.experience?.time?.delta) ? this.experience.time.delta : 16.67
      const fps = 1000 / Math.max(1, dt)

      let target = this.currentPixelRatio

      if (fps < this.dynamicScale.fpsDown) {
        // baja un poco (más suave que un salto brusco)
        target = this.currentPixelRatio * 0.92
      } else if (fps > this.dynamicScale.fpsUp) {
        // sube un poco
        target = this.currentPixelRatio * 1.05
      }

      // clamp + hysteresis para evitar aplicar cada frame
      const clamped = Math.min(this.dynamicScale.max, Math.max(this.dynamicScale.min, target))
      if (Math.abs(clamped - this.currentPixelRatio) > this.dynamicScale.hysteresis) {
        this.currentPixelRatio = clamped
        this.instance.setPixelRatio(this.currentPixelRatio)
        // No cambiamos el size aquí (ya está correcto); solo el pixelRatio
      }
    }

    // Render del frame
    this.instance.render(this.scene, this.camera.instance)
  }
}
