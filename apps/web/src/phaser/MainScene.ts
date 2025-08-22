import Phaser from 'phaser'

// ---- Seeded RNG (Mulberry32) ----
function mulberry32(seed: number) {
  let t = seed >>> 0
  return function (): number {
    t += 0x6D2B79F5
    let r = Math.imul(t ^ (t >>> 15), 1 | t)
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r)
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}
function strHash32(s: string) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0)
}

type EnemyKind = 'light' | 'batch'
type EnemyGO = Phaser.Types.Physics.Arcade.SpriteWithDynamicBody & {
  hp: number
  speed: number
  t: number // path progress [0..1]
}
type Tower = {
  x: number; y: number
  fireCooldown: number
  range: number // in tiles
  energyCost: number
  dps: number
  kind: 'eth' // iteration-1: one tower
}

export default class MainScene extends Phaser.Scene {
  seed: number
  runId: string
  season: number
  nonce: string

  tile = 32
  gridW = 32
  gridH = 18
  path: Phaser.Math.Vector2[] = []

  enemies!: Phaser.Physics.Arcade.Group
  projectiles!: Phaser.Physics.Arcade.Group
  towers: Tower[] = []

  // resources / meta
  score = 0
  wave = 1
  base = 20
  runStart = 0
  runLimitMs = 4 * 60 * 1000 // 4 minutes

  // global resources
  vramMax = 24         // max simultaneous projectiles
  rpcPerSec = 12       // global shots/s
  energyMax = 100
  energy = 100
  energyRegen = 15     // per second
  rpcBucket = 0        // regen per sec
  credits = 150

  // UI
  hudText!: Phaser.GameObjects.Text
  timerText!: Phaser.GameObjects.Text

  placing = false

  constructor(seed: number, runId: string, season: number, nonce: string) {
    super('Main')
    this.seed = seed
    this.runId = runId
    this.season = season
    this.nonce = nonce
  }

  preload() {
    // generate 1-bit/pixel textures at runtime
    const g = this.add.graphics()
    // enemy light (cyan square 10x10)
    g.clear().fillStyle(0x66e7ff).fillRect(0, 0, 10, 10)
    g.generateTexture('e_light', 10, 10)
    // enemy batch (violet 12x12)
    g.clear().fillStyle(0x9d7bff).fillRect(0, 0, 12, 12)
    g.generateTexture('e_batch', 12, 12)
    // projectile (white 3x3)
    g.clear().fillStyle(0xffffff).fillRect(0, 0, 3, 3)
    g.generateTexture('proj', 3, 3)
    // tower (teal 12x12)
    g.clear().fillStyle(0x5eead4).fillRect(0, 0, 12, 12)
    g.generateTexture('tower', 12, 12)
    g.destroy()
  }

  create() {
    this.cameras.main.setBackgroundColor('#0b0b0f')

    // pixel perfect render
    this.game.config.pixelArt = true as any

    // draw procedural path (seeded)
    this.path = this.makePath(this.seed)
    this.drawPath()

    // groups
    this.enemies = this.physics.add.group()
    this.projectiles = this.physics.add.group()

    // collisions
    this.physics.add.overlap(this.projectiles, this.enemies, (p, e) => this.hitEnemy(p as any, e as any))

    // UI texts
    this.hudText = this.add.bitmapText ? (this.add as any).bitmapText(10, 10, '', '', 12) :
      this.add.text(10, 10, '', { fontFamily: 'monospace', fontSize: '14px', color: '#ecf0ff' })
    this.timerText = this.add.text(this.scale.width - 40, 10, '4:00', { fontFamily: 'monospace', fontSize: '14px', color: '#ecf0ff' }).setOrigin(1, 0)

    // input: place tower on click (not on path)
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.credits < 50) return
      const gx = Math.floor(p.x / this.tile)
      const gy = Math.floor(p.y / this.tile)
      if (!this.inGrid(gx, gy)) return
      if (this.isPath(gx, gy)) return
      if (this.isOccupied(gx, gy)) return
      // place tower (Eth Prover)
      this.towers.push({
        x: gx, y: gy, fireCooldown: 0, range: 4, energyCost: 1, dps: 12, kind: 'eth'
      })
      this.credits -= 50
      const px = gx * this.tile + this.tile / 2
      const py = gy * this.tile + this.tile / 2
      this.add.image(px, py, 'tower').setOrigin(0.5).setScale(1)
    })

    // start run
    this.runStart = this.time.now
    this.time.addEvent({ delay: 1000, loop: true, callback: () => this.resourceTick() })
    this.time.addEvent({ delay: 100, loop: true, callback: () => this.rpcBucket = Math.min(this.rpcPerSec, this.rpcBucket + this.rpcPerSec / 10) })
    this.scheduleNextWave()
  }

  // ---- Path generation: left -> right with seeded bends ----
  makePath(seed: number) {
    const rand = mulberry32(seed >>> 0)
    const grid: boolean[][] = Array.from({ length: this.gridH }, () => Array(this.gridW).fill(false))
    const p: Phaser.Math.Vector2[] = []
    let x = 0
    let y = Math.floor(3 + rand() * (this.gridH - 6))
    p.push(new Phaser.Math.Vector2(x, y)); grid[y][x] = true

    const maxSteps = this.gridW * this.gridH * 2
    let steps = 0
    while (x < this.gridW - 1 && steps < maxSteps) {
      steps++
      // forward bias to the right
      const dirs = [
        { dx: 1, dy: 0, w: 0.6 }, // right
        { dx: 0, dy: rand() < 0.5 ? 1 : -1, w: 0.4 } // up/down
      ]
      // try choose a direction with bounds & not revisiting
      let chosen: { dx: number, dy: number } | null = null
      for (let tries = 0; tries < 6; tries++) {
        const pick = rand() < dirs[0].w ? dirs[0] : { dx: 0, dy: rand() < 0.5 ? 1 : -1, w: 0.4 }
        const nx = x + pick.dx
        const ny = y + pick.dy
        if (nx < 0 || ny < 0 || nx >= this.gridW || ny >= this.gridH) continue
        if (grid[ny][nx]) continue
        chosen = { dx: pick.dx, dy: pick.dy }
        break
      }
      if (!chosen) {
        // fallback: force right if possible
        if (x + 1 < this.gridW) chosen = { dx: 1, dy: 0 }
        else break
      }
      x += chosen.dx; y += chosen.dy
      p.push(new Phaser.Math.Vector2(x, y))
      grid[y][x] = true
    }
    // ensure reach right border
    while (x < this.gridW - 1) {
      x += 1
      p.push(new Phaser.Math.Vector2(x, y))
    }
    return p
  }

  drawPath() {
    const g = this.add.graphics()
    g.lineStyle(4, 0x2a3242, 1)
    g.beginPath()
    for (let i = 0; i < this.path.length; i++) {
      const px = this.path[i].x * this.tile + this.tile / 2
      const py = this.path[i].y * this.tile + this.tile / 2
      if (i === 0) g.moveTo(px, py)
      else g.lineTo(px, py)
    }
    g.strokePath()
  }

  inGrid(x: number, y: number) {
    return x >= 0 && y >= 0 && x < this.gridW && y < this.gridH
  }
  isPath(x: number, y: number) {
    return this.path.some(v => v.x === x && v.y === y)
  }
  isOccupied(x: number, y: number) {
    return this.towers.some(t => t.x === x && t.y === y)
  }

  // ---- Waves ----
  scheduleNextWave() {
    this.time.delayedCall(900, () => this.spawnWave(this.wave))
  }

  spawnWave(n: number) {
    const rand = mulberry32((this.seed ^ n) >>> 0)
    // light units
    const count = 6 + Math.floor(n * 1.2)
    for (let i = 0; i < count; i++) {
      this.time.delayedCall(350 * i, () => this.spawnEnemy('light', rand))
    }
    // batch every 4th wave
    if (n % 4 === 0) {
      for (let i = 0; i < 3; i++) {
        this.time.delayedCall(400 * (count + i), () => this.spawnEnemy('batch', rand))
      }
    }
  }

  spawnEnemy(kind: EnemyKind, rand: () => number) {
    const start = this.path[0]
    const px = start.x * this.tile + this.tile / 2
    const py = start.y * this.tile + this.tile / 2
    const key = kind === 'light' ? 'e_light' : 'e_batch'
    const e = this.enemies.create(px, py, key) as EnemyGO
    e.setOrigin(0.5)
    e.hp = (kind === 'light') ? (12 + this.wave * 1.2) : (60 + this.wave * 8)
    e.speed = (kind === 'light') ? (70 + this.wave * 2) : (40 + this.wave * 1.2)
    e.t = 0
    ;(e.body as Phaser.Physics.Arcade.Body).setAllowGravity(false)
  }

  // ---- Combat ----
  hitEnemy(p: Phaser.Types.Physics.Arcade.ImageWithDynamicBody, e: EnemyGO) {
    // basic damage
    const dmg = 10
    e.hp -= dmg
    // destroy projectile (VRAM free)
    p.destroy()
    if (e.hp <= 0) {
      this.score += 10
      e.destroy()
    }
  }

  fireFromTower(t: Tower, dt: number) {
    t.fireCooldown -= dt
    if (t.fireCooldown > 0) return

    // global resource checks
    const projCount = this.projectiles.getChildren().length
    if (projCount >= this.vramMax) return
    if (this.rpcBucket < 1) return
    if (this.energy < t.energyCost) return

    // find target in range
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

    // consume resources
    this.rpcBucket -= 1
    this.energy = Math.max(0, this.energy - t.energyCost)
    t.fireCooldown = Math.max(0.12, 1.0 - t.dps / 20) // rough rate from DPS

    // spawn projectile
    const proj = this.projectiles.create(tx, ty, 'proj') as Phaser.Physics.Arcade.Image
    ;(proj.body as Phaser.Physics.Arcade.Body).setAllowGravity(false)
    const ang = Phaser.Math.Angle.Between(tx, ty, target.x, target.y)
    const spd = 220
    proj.body.velocity.x = Math.cos(ang) * spd
    proj.body.velocity.y = Math.sin(ang) * spd

    // auto-destroy after 2s
    this.time.delayedCall(2000, () => proj && proj.destroy())
  }

  resourceTick() {
    // regen energy + slight RPC top-up (bucket handled in separate timer)
    this.energy = Math.min(this.energyMax, this.energy + this.energyRegen)
  }

  moveEnemies(delta: number) {
    const dt = delta / 1000
    for (const obj of this.enemies.getChildren()) {
      const e = obj as EnemyGO
      // move along polyline by arc-length approximation
      const speed = e.speed * dt
      // advance along small steps
      for (let step = 0; step < 4; step++) {
        const next = this.advanceAlongPath(e.x, e.y, speed / 4)
        e.setPosition(next.x, next.y)
      }
      // check end
      const last = this.path[this.path.length - 1]
      const lastPx = last.x * this.tile + this.tile / 2
      const lastPy = last.y * this.tile + this.tile / 2
      if (Phaser.Math.Distance.Between(e.x, e.y, lastPx, lastPy) < 6) {
        e.destroy()
        this.base = Math.max(0, this.base - 1)
      }
    }
  }

  advanceAlongPath(x: number, y: number, dist: number) {
    // find nearest segment, then move forward along path direction
    let closestI = 0
    let best = Infinity
    for (let i = 0; i < this.path.length - 1; i++) {
      const a = this.path[i]
      const b = this.path[i + 1]
      const ax = a.x * this.tile + this.tile / 2
      const ay = a.y * this.tile + this.tile / 2
      const bx = b.x * this.tile + this.tile / 2
      const by = b.y * this.tile + this.tile / 2
      // distance from point to segment (manhattan-ish is fine)
      const d = Phaser.Math.Distance.Between(x, y, bx, by)
      if (d < best) { best = d; closestI = i }
    }
    // move towards next node
    const cur = this.path[Math.min(closestI + 1, this.path.length - 1)]
    const tx = cur.x * this.tile + this.tile / 2
    const ty = cur.y * this.tile + this.tile / 2
    const ang = Phaser.Math.Angle.Between(x, y, tx, ty)
    return new Phaser.Math.Vector2(x + Math.cos(ang) * dist, y + Math.sin(ang) * dist)
  }

  update(time: number, delta: number) {
    // towers try to fire
    const dt = delta / 1000
    for (const t of this.towers) this.fireFromTower(t, dt)

    // move enemies
    this.moveEnemies(delta)

    // UI refresh
    const nick = localStorage.getItem('nickname') || 'anon'
    this.hudText.setText(
      `Score: ${Math.floor(this.score)}\nWave: ${this.wave}\nBase: ${this.base}\nNick: ${nick}\nVRAM: ${this.projectiles.getChildren().length}/${this.vramMax}  RPC: ${Math.floor(this.rpcBucket)}/${this.rpcPerSec}  Energy: ${Math.floor(this.energy)}`
    )

    // wave completion check
    if (this.enemies.countActive(true) === 0 && this.time.now - this.runStart > 800) {
      // start next wave after short pause
      this.wave++
      this.scheduleNextWave()
    }

    // timer / end run
    const elapsed = time - this.runStart
    const remain = Math.max(0, this.runLimitMs - elapsed)
    const mm = Math.floor(remain / 60000)
    const ss = Math.floor((remain % 60000) / 1000)
    this.timerText.setText(`${mm}:${ss.toString().padStart(2, '0')}`)

    if (remain <= 0 || this.base <= 0) {
      this.finishRun()
    }
  }

  finishRun() {
    // prevent multiple emits
    if ((this as any)._finished) return
    ;(this as any)._finished = true
    const durationMs = Math.min(this.runLimitMs, this.time.now - this.runStart)
    this.game.events.emit('run_finished', { score: Math.floor(this.score), wave: this.wave, durationMs })
    this.scene.pause()
  }
}
