import Phaser from 'phaser'

// -------- Seeded RNG (Mulberry32) ----------
function mulberry32(seed: number) {
  let t = seed >>> 0
  return function (): number {
    t += 0x6D2B79F5
    let r = Math.imul(t ^ (t >>> 15), 1 | t)
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r)
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

type EnemyKind = 'light' | 'batch'
type EnemyGO = Phaser.Types.Physics.Arcade.SpriteWithDynamicBody & {
  hp: number
  speed: number
  pathIdx: number
}

type Tower = {
  x: number; y: number
  fireCooldown: number
  range: number
  energyCost: number
  dps: number
  kind: 'eth'
}

export default class MainScene extends Phaser.Scene {
  seed: number
  runId: string
  season: number
  nonce: string

  // grid
  tile = 34         // ~6% больше
  gridW = 32
  gridH = 18
  path: Phaser.Math.Vector2[] = []

  // groups
  enemies!: Phaser.Physics.Arcade.Group
  projectiles!: Phaser.Physics.Arcade.Group
  towers: Tower[] = []

  // meta
  score = 0
  wave = 1
  base = 20
  runStart = 0
  runLimitMs = 4 * 60 * 1000

  // resources (строго и предсказуемо)
  vramMax = 20            // сколько снарядов может одновременно лететь
  rpcPerSec = 6           // бак RPC пополняется до этого значения каждый 1с
  rpcBucket = 0
  energyMax = 100
  energy = 100
  energyRegen = 10        // +10 за секунду

  // wave pacing
  spawning = false
  waveEndsAt = 0          // когда заканчивается окно спавна волны

  // UI
  nickText!: Phaser.GameObjects.Text
  hudText!: Phaser.GameObjects.Text
  timerText!: Phaser.GameObjects.Text

  constructor(seed: number, runId: string, season: number, nonce: string) {
    super('Main')
    this.seed = seed
    this.runId = runId
    this.season = season
    this.nonce = nonce
  }

  preload() {
    // минималистичные пиксельные спрайты
    const g = this.add.graphics()
    g.clear().fillStyle(0x66e7ff).fillRect(0, 0, 10, 10); g.generateTexture('e_light', 10, 10)
    g.clear().fillStyle(0x9d7bff).fillRect(0, 0, 12, 12); g.generateTexture('e_batch', 12, 12)
    g.clear().fillStyle(0xffffff).fillRect(0, 0, 3, 3);   g.generateTexture('proj', 3, 3)
    g.clear().fillStyle(0x5eead4).fillRect(0, 0, 12, 12); g.generateTexture('tower', 12, 12)
    g.destroy()
  }

  create() {
    this.cameras.main.setBackgroundColor('#0b0b0f')

    // вычислим текущую сетку из размеров канваса
    this.gridW = Math.floor(this.scale.width / this.tile)
    this.gridH = Math.floor(this.scale.height / this.tile)

    // путь
    this.path = this.makePath(this.seed)
    this.drawPathPixels()

    // группы
    this.enemies = this.physics.add.group()
    this.projectiles = this.physics.add.group()
    this.physics.add.overlap(this.projectiles, this.enemies, (p, e) => this.hitEnemy(p as any, e as any))

    // HUD
    const W = this.scale.width
    this.nickText = this.add.text(10, 8, `Nick: ${(localStorage.getItem('nickname') || 'anon')}`, {
      fontFamily: 'Inter, monospace', fontSize: '20px', fontStyle: 'bold', color: '#ecf0ff'
    })
    this.hudText = this.add.text(10, 36, '', {
      fontFamily: 'Inter, monospace', fontSize: '16px', fontStyle: 'bold', color: '#ecf0ff'
    })
    this.timerText = this.add.text(W - 40, 10, '0:00', {
      fontFamily: 'Inter, monospace', fontSize: '16px', fontStyle: 'bold', color: '#ecf0ff'
    }).setOrigin(1, 0)

    // установка башни по клику
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      const gx = Math.floor(p.x / this.tile)
      const gy = Math.floor(p.y / this.tile)
      if (!this.inGrid(gx, gy) || this.isPath(gx, gy) || this.isOccupied(gx, gy)) return
      if (this.energy < 5) return // небольшая защита от спама в самом начале
      this.towers.push({ x: gx, y: gy, fireCooldown: 0, range: 4, energyCost: 3, dps: 12, kind: 'eth' })
      const px = gx * this.tile + this.tile / 2
      const py = gy * this.tile + this.tile / 2
      this.add.image(px, py, 'tower').setOrigin(0.5)
    })

    // тик ресурсов — ровно раз в секунду
    this.runStart = this.time.now
    this.time.addEvent({
      delay: 1000, loop: true, callback: () => {
        this.energy = Math.min(this.energyMax, this.energy + this.energyRegen)
        this.rpcBucket = this.rpcPerSec         // баче наполняется мгновенно раз в 1с
      }
    })

    // первая волна
    this.startWave()
  }

  // ---------- путь: без самопересечений + минимальная длина отрезка ----------
  makePath(seed: number) {
    const rnd = mulberry32(seed >>> 0)
    const visited = Array.from({ length: this.gridH }, () => Array(this.gridW).fill(false))
    const pts: Phaser.Math.Vector2[] = []

    let x = 0
    let y = Math.floor(this.gridH * (0.2 + rnd() * 0.6))
    visited[y][x] = true
    pts.push(new Phaser.Math.Vector2(x, y))

    let dir: 'R' | 'U' | 'D' = 'R'
    let straight = 0
    const minStraight = 2          // минимум 2 клетки между поворотами
    const maxSteps = this.gridW * this.gridH * 2

    for (let steps = 0; steps < maxSteps && x < this.gridW - 1; steps++) {
      // список потенциальных направлений: вправо приоритетно (x не уменьшаем)
      const options: Array<{ dx: number, dy: number, tag: 'R' | 'U' | 'D', w: number }> = [
        { dx: 1, dy: 0, tag: 'R', w: 0.55 },
        { dx: 0, dy: -1, tag: 'U', w: 0.225 },
        { dx: 0, dy: 1, tag: 'D', w: 0.225 },
      ]
      // запрещаем поворот, если не выдержали прямой участок
      const filtered = options.filter(o => {
        if ((o.tag === 'U' || o.tag === 'D') && straight < minStraight) return false
        return true
      })

      let chosen: typeof options[number] | null = null
      for (let tries = 0; tries < 8; tries++) {
        const r = rnd()
        let acc = 0
        const pick = (filtered.length ? filtered : options).find(o => (acc += o.w) >= r) || options[0]
        const nx = x + pick.dx
        const ny = y + pick.dy
        if (nx < 0 || ny < 0 || nx >= this.gridW || ny >= this.gridH) continue
        if (visited[ny][nx]) continue   // не пересекаем самих себя
        chosen = pick
        break
      }
      if (!chosen) {
        // форсируем движение вправо если можем
        if (x + 1 < this.gridW && !visited[y][x + 1]) {
          chosen = { dx: 1, dy: 0, tag: 'R', w: 1 }
        } else break
      }

      x += chosen.dx; y += chosen.dy
      visited[y][x] = true
      pts.push(new Phaser.Math.Vector2(x, y))

      if (chosen.tag === dir) straight++
      else { dir = chosen.tag; straight = 1 }
    }

    // гарантированно доведём до правой границы
    while (x < this.gridW - 1) {
      x += 1
      if (!visited[y][x]) {
        visited[y][x] = true
        pts.push(new Phaser.Math.Vector2(x, y))
      }
    }
    return pts
  }

  // пиксельная дорожка (каждая клетка пути — «плитка»)
  drawPathPixels() {
    const g = this.add.graphics()
    const pad = Math.max(2, Math.floor(this.tile * 0.18))
    const w = this.tile - pad * 2
    const h = this.tile - pad * 2
    g.fillStyle(0x232a36, 1)
    for (const v of this.path) {
      const x = v.x * this.tile + pad
      const y = v.y * this.tile + pad
      g.fillRect(x, y, w, h)
    }
  }

  inGrid(x: number, y: number) { return x >= 0 && y >= 0 && x < this.gridW && y < this.gridH }
  isPath(x: number, y: number) { return this.path.some(v => v.x === x && v.y === y) }
  isOccupied(x: number, y: number) { return this.towers.some(t => t.x === x && t.y === y) }

  // ---------- Waves (25–60s) ----------
  startWave() {
    const rnd = mulberry32((this.seed ^ this.wave) >>> 0)
    const waveSecs = 25 + Math.floor(rnd() * 35) // 25..60
    this.waveEndsAt = this.time.now + waveSecs * 1000

    const totalLight = 8 + Math.floor(this.wave * 1.8)
    const totalBatch = (this.wave % 4 === 0) ? (2 + Math.floor(this.wave / 4)) : 0
    const total = totalLight + totalBatch

    const spawnWindow = waveSecs * 0.6
    const interval = Math.max(0.25, spawnWindow / Math.max(1, total))
    let spawned = 0

    this.spawning = true
    const t = this.time.addEvent({
      delay: interval * 1000,
      loop: true,
      callback: () => {
        if (spawned < totalLight) this.spawnEnemy('light')
        else if (spawned < total) this.spawnEnemy('batch')
        else { this.spawning = false; t.remove(false) }
        spawned++
      }
    })
  }

  spawnEnemy(kind: EnemyKind) {
    const start = this.path[0]
    const px = start.x * this.tile + this.tile / 2
    const py = start.y * this.tile + this.tile / 2
    const key = (kind === 'light') ? 'e_light' : 'e_batch'
    const e = this.enemies.create(px, py, key) as EnemyGO
    e.setOrigin(0.5)
    e.pathIdx = 0
    e.hp = (kind === 'light') ? (14 + this.wave * 1.4) : (70 + this.wave * 9)
    e.speed = (kind === 'light') ? (80 + this.wave * 2.5) : (46 + this.wave * 1.5)
    ;(e.body as Phaser.Physics.Arcade.Body).setAllowGravity(false)
  }

  // ---------- Combat ----------
  hitEnemy(p: Phaser.Types.Physics.Arcade.ImageWithDynamicBody, e: EnemyGO) {
    const dmg = 10
    e.hp -= dmg
    p.destroy()
    if (e.hp <= 0) { this.score += 10; e.destroy() }
  }

  fireFromTower(t: Tower, dt: number) {
    t.fireCooldown -= dt
    if (t.fireCooldown > 0) return
    if (this.projectiles.getChildren().length >= this.vramMax) return
    if (this.rpcBucket < 1) return
    if (this.energy < t.energyCost) return

    // target
    const rangePx = t.range * this.tile
    const tx = t.x * this.tile + this.tile / 2
    const ty = t.y * this.tile + this.tile / 2
    let target: EnemyGO | null = null
    let best = Infinity
    this.enemies.getChildren().forEach((obj) => {
      const e = obj as EnemyGO
      const d = Phaser.Math.Distance.Between(tx, ty, e.x, e.y)
      if (d <= rangePx && d < best) { best = d; target = e }
    })
    if (!target) return

    // consume
    this.rpcBucket -= 1
    this.energy = Math.max(0, this.energy - t.energyCost)
    t.fireCooldown = Math.max(0.12, 1.0 - t.dps / 20)

    // projectile
    const proj = this.projectiles.create(tx, ty, 'proj') as Phaser.Physics.Arcade.Image
    ;(proj.body as Phaser.Physics.Arcade.Body).setAllowGravity(false)
    const ang = Phaser.Math.Angle.Between(tx, ty, target.x, target.y)
    const spd = 230
    proj.body.velocity.x = Math.cos(ang) * spd
    proj.body.velocity.y = Math.sin(ang) * spd
    this.time.delayedCall(2000, () => proj && proj.destroy())
  }

  // ---------- Update ----------
  update(time: number, delta: number) {
    const dt = delta / 1000

    // enemies move along waypoints
    const lastI = this.path.length - 1
    for (const obj of this.enemies.getChildren()) {
      const e = obj as EnemyGO
      const i = Math.min(e.pathIdx, lastI - 1)
      const a = this.path[i], b = this.path[i + 1]
      const ax = a.x * this.tile + this.tile / 2
      const ay = a.y * this.tile + this.tile / 2
      const bx = b.x * this.tile + this.tile / 2
      const by = b.y * this.tile + this.tile / 2
      const ang = Phaser.Math.Angle.Between(ax, ay, bx, by)
      const step = e.speed * dt
      const nx = e.x + Math.cos(ang) * step
      const ny = e.y + Math.sin(ang) * step
      e.setPosition(nx, ny)
      if (Phaser.Math.Distance.Between(nx, ny, bx, by) < 6 && i < lastI - 1) e.pathIdx++
      if (i >= lastI - 1 && Phaser.Math.Distance.Between(nx, ny, bx, by) < 6) {
        e.destroy(); this.base = Math.max(0, this.base - 1)
      }
    }

    // towers
    for (const t of this.towers) this.fireFromTower(t, dt)

    // HUD
    const nick = localStorage.getItem('nickname') || 'anon'
    this.nickText.setText(`Nick: ${nick}`)
    this.hudText.setText(
      `Score: ${Math.floor(this.score)}\nWave: ${this.wave}\nBase: ${this.base}\nVRAM: ${this.projectiles.getChildren().length}/${this.vramMax}  RPC: ${this.rpcBucket}/${this.rpcPerSec}  Energy: ${Math.floor(this.energy)}`
    )

    // wave timer (показываем оставшееся время окна этой волны)
    const remain = Math.max(0, this.waveEndsAt - time)
    const mm = Math.floor(remain / 60000)
    const ss = Math.floor((remain % 60000) / 1000)
    this.timerText.setText(`${mm}:${ss.toString().padStart(2, '0')}`)

    // переход на следующую волну после истечения окна + когда поле очищено
    if (time >= this.waveEndsAt && this.enemies.countActive(true) === 0 && !this.spawning) {
      this.wave++
      this.startWave()
    }

    // завершение ран-а
    if ((time - this.runStart) >= this.runLimitMs || this.base <= 0) this.finishRun()
  }

  finishRun() {
    if ((this as any)._finished) return
    ;(this as any)._finished = true
    const durationMs = Math.min(this.runLimitMs, this.time.now - this.runStart)
    this.game.events.emit('run_finished', { score: Math.floor(this.score), wave: this.wave, durationMs })
    this.scene.pause()
  }
}
