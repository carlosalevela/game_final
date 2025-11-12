export default class LevelManager {
  constructor(experience) {
    this.experience = experience;
    this.currentLevel = 1;   // Inicias en el nivel 1
    this.totalLevels  = 3;   // 1 -> 2 -> 3
    this.isTransitioning = false;
  }

  goTo(level) {
    const target = Math.max(1, Math.min(this.totalLevels, level));
    this.currentLevel = target;
    this.experience.world.clearCurrentScene?.();
    this.experience.world.loadLevel(this.currentLevel);
  }

  nextLevel() {
    if (this.isTransitioning) return;
    if (this.currentLevel >= this.totalLevels) return;

    this.isTransitioning = true;
    this.currentLevel++;

    this.experience.world.clearCurrentScene?.();
    this.experience.world.loadLevel(this.currentLevel);

    setTimeout(() => { this.isTransitioning = false; }, 300);
  }

  resetLevel() {
    this.currentLevel = 1;
    this.isTransitioning = false;
    this.experience.world.clearCurrentScene?.();
    this.experience.world.loadLevel(this.currentLevel);
  }

  // 🎯 Umbral de monedas por nivel
  getCurrentLevelTargetPoints() {
    // Nivel 2: exactamente 3 monedas para habilitar el portal
    if (this.currentLevel === 2) return 3;
    // Nivel 3: exactamente 5 monedas -> fin de juego directo (sin portal)
    if (this.currentLevel === 3) return 5;

    // Para el resto, usa el conteo real cargado
    const real = this.experience?.world?.totalDefaultCoins;
    if (Number.isFinite(real) && real > 0) return real;

    return 2; // fallback conservador
  }
}
