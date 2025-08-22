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

type EnemyKind = 'light' | 'batch'
type EnemyGO = Phaser.Types.Physics.Arcade.SpriteWithDynamicBody & {
  hp: number
  speed: number
  pathIdx: number   // current waypoint index
}

type Tower = {
  x: number; y: number
  fireCooldown: number
  range: number // tiles
  energyCost: number
  dps: number
  kind: 'eth'
}

export default class MainScene extends Phaser.Scene {
  seed: number
  runId: string
  season: number
  nonce: string

  tile = 34 // ~+6% scale up vs 32px
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
  runLimitMs = 4 * 60 * 1000

  // global resources (slower fill)
  vramMax = 20
  rpcPerSec = 6          // slower global fire-rate
  rpcBucket = 0          // refills once per second up to rpcPerSec
  energyMax = 100
  energy = 100
  energyRegen = 10       // per second
  credits = 150

  // wave pacing
  spawning = false
  spawnDoneAt = 0

  // UI
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
    // generate tiny pixel sprites at runtime
    const g = this.add.graphics()
    g.clear().fillStyle(0x66e7ff).fillRect(0, 0, 10, 10) // light enemy
    g.generateTexture('e_light', 10, 10)
    g.clear().fillStyle(0x9d7bff).fillRect(0, 0, 12, 12) // batch enemy
    g.generateTexture('e_batch', 12, 12)
    g.clear().fillStyle(0xffffff).fillRect(0, 0, 3, 3) // projectile
    g.generateTexture('proj', 3, 3)
    g.clear().fillStyle(0x5eead4).fillRect(0, 0, 12, 12) // tower
    g.generateTexture('tower', 12, 12)
    g.destroy()
  }

  create() {
    this.cameras.main.setBackgroundColor('#0b0b0f')

    // calculate grid from canvas size and tile
    const W = this.scale.width
    const H = this.scale.height
    this.gridW = Math.floor(W / this.tile)
    this.gridH = Math.floor(H / this.tile)

    // path
    this.path = this.makePath(this.seed)
    this.drawPath()

    // groups
    this.enemies = this.physics.add.group()
    this.projectiles = this.physics.add.group()
    this.physics.add.overlap(this.projectiles, this.enemies, (p, e) => this.hitEnemy(p as any, e as any))

    // HUD (bolder)
    this.hudText = this.add.text(10, 10, '', {
      fontFamily: 'Inter, monospace', fontSize: '16px', color: '#ecf0ff', fontStyle: 'bold'
    })
    this.timerText = this.add.text(W - 40, 10, '4:00', {
      fontFamily: 'Inter, monospace', fontSize: '16px', color: '#ecf0ff', fontStyle: 'bold'
    }).setOrigin(1, 0)

    // placing towers by click on empty non-path tile
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.credits < 50) return
      const gx = Math.floor(p.x / this.tile)
      const gy = Math.floor(p.y / this.tile)
      if (!this.inGrid(gx, gy) || this.isPath(gx, gy) || this.isOccupied(gx, gy)) return
      this.towers.push({ x: gx, y: gy, fireCooldown: 0, range: 4, energyCost: 1, dps: 12, kind: 'eth' })
      this.credits -= 50
      const px = gx * this.tile + this.tile / 2
      const py = gy * this.tile + this.tile / 2
      this.add.image(px, py, 'tower').setOrigin(0.5)
    })

    // timers: once/sec resources
    this.runStart = this.time.now
    this.time.addEvent({
      delay: 1000, loop: true, callback: () => {
        this.energy = Math.min(this.energyMax, this.energy + this.energyRegen)
        this.rpcBucket = Math.min(this.rpcPerSec, this.rpcBucket + this.rpcPerSec)
      }
    })

    // first wave
    this.startWave()
  }

  // ---- Procedural path: meander across most of the arena ----
  makePath(seed: number) {
    const rnd = mulberry32(seed >>> 0)
    const pts: Phaser.Math.Vector2[] = []
    let x = 0
    let y = Math.floor(this.gridH * (0.2 + rnd() * 0.6)) // start somewhere 20%..80% height
    pts.push(new Phaser.Math.Vector2(x, y))

    // choose vertical "targets" to encourage big vertical moves
    let targetY = Math.floor(this.gridH * (0.2 + rnd() * 0.6))
    while (x < this.gridW - 1) {
      // bias to the right, but also try to approach targetY
      const moveRight = rnd() < 0.65
      if (moveRight) x += 1
      else {
        if (y < targetY) y += 1
        else if (y > targetY) y -= 1
        else y += (rnd() < 0.5 ? 1 : -1)
      }
      // clamp
      if (y < 1) y = 1
      if (y > this.gridH - 2) y = this.gridH - 2

      pts.push(new Phaser.Math.Vector2(x, y))

      // occasionally pick a new vertical target to sweep across height
      if (rnd() < 0.08) targetY = Math.floor(this.gridH * (0.2 + rnd() * 0.6))
    }

    return pts
  }

  drawPath() {
    const g = this.add.graphics()
    g.lineStyle(4, 0x2a3242, 1)
    g.beginPath()
    for (let i = 0; i < this.path.length; i++) {
      const px = this.path[i].x * this.tile + this.tile / 2
      const py = this.path[i].y * this.tile + this.tile / 2
      if (i === 0) g.moveTo(px, py); else g.lineTo(px, py)
    }
    g.strokePath()
  }

  inGrid(x: number, y: number) { return x >= 0 && y >= 0 && x < this.gridW && y < this.gridH }
  isPath(x: number, y: number) { return this.path.some(v => v.x === x && v.y === y) }
  isOccupied(x: number, y: number) { return this.towers.some(t => t.x === x && t.y === y) }

  // ---- Waves (25–60s each) ----
  startWave() {
    const rnd = mulberry32((this.seed ^ this.wave) >>> 0)
    const waveSecs = 25 + Math.floor(rnd() * 35)  // 25..60 seconds
    const totalLight = 8 + Math.floor(this.wave * 1.8)
    const totalBatch = (this.wave % 4 === 0) ? 2 + Math.floor(this.wave / 4) : 0
    const total = totalLight + totalBatch

    // spawn enemies during first ~60% of wave duration
    const spawnWindow = waveSecs * 0.6
    const interval = Math.max(0.25, spawnWindow / Math.max(1, total))
    let spawned = 0

    this.spawning = true
    const spawnTimer = this.time.addEvent({
      delay: interval * 1000,
      loop: true,
      callback: () => {
        if (spawned < totalLight) {
          this.spawnEnemy('light')
        } else if (spawned < totalLight + totalBatch) {
          this.spawnEnemy('batch')
        } else {
          spawnTimer.remove(false)
          this.spawning = false
          this.spawnDoneAt = this.time.now
        }
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
    // stats scale with wave
    e.hp = (kind === 'light') ? (14 + this.wave * 1.4) : (70 + this.wave * 9)
    e.speed = (kind === 'light') ? (80 + this.wave * 2.5) : (46 + this.wave * 1.5)
    ;(e.body as Phaser.Physics.Arcade.Body).setAllowGravity(false)
  }

  // ---- Combat ----
  hitEnemy(p: Phaser.Types.Physics.Arcade.ImageWithDynamicBody, e: EnemyGO) {
    const dmg = 10
    e.hp -= dmg
    p.destroy()
    if (e.hp <= 0) {
      this.score += 10
      e.destroy()
    }
  }

  fireFromTower(t: Tower, dt: number) {
    t.fireCooldown -= dt
    if (t.fireCooldown > 0) return

    // global resource gates
    if (this.projectiles.getChildren().length >= this.vramMax) return
    if (this.rpcBucket < 1) return
    if (this.energy < t.energyCost) return

    // target in range
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

  // ---- Update loop ----
  update(time: number, delta: number) {
    const dt = delta / 1000

    // move enemies along path using waypoint index
    const lastI = this.path.length - 1
    for (const obj of this.enemies.getChildren()) {
      const e = obj as EnemyGO
      let i = Math.min(e.pathIdx, lastI - 1)
      const a = this.path[i]
      const b = this.path[i + 1]
      const ax = a.x * this.tile + this.tile / 2
      const ay = a.y * this.tile + this.tile / 2
      const bx = b.x * this.tile + this.tile / 2
      const by = b.y * this.tile + this.tile / 2

      const ang = Phaser.Math.Angle.Between(ax, ay, bx, by)
      const step = e.speed * dt
      const nx = e.x + Math.cos(ang) * step
      const ny = e.y + Math.sin(ang) * step
      e.setPosition(nx, ny)

      // advance waypoint
      if (Phaser.Math.Distance.Between(nx, ny, bx, by) < 6 && i < lastI - 1) {
        e.pathIdx++
      }

      // reached end?
      if (i >= lastI - 1 && Phaser.Math.Distance.Between(nx, ny, bx, by) < 6) {
        e.destroy()
        this.base = Math.max(0, this.base - 1)
      }
    }

    // towers
    for (const t of this.towers) this.fireFromTower(t, dt)

    // HUD
    const nick = localStorage.getItem('nickname') || 'anon'
    this.hudText.setText(
      `Score: ${Math.floor(this.score)}\nWave: ${this.wave}\nBase: ${this.base}\nNick: ${nick}\nVRAM: ${this.projectiles.getChildren().length}/${this.vramMax}  RPC: ${Math.floor(this.rpcBucket)}/${this.rpcPerSec}  Energy: ${Math.floor(this.energy)}`
    )

    // wave progression: when spawning finished AND no enemies left
    if (!this.spawning && this.enemies.countActive(true) === 0) {
      // short breather
      this.time.delayedCall(1500, () => {
        if (this.enemies.countActive(true) === 0) {
          this.wave++
          this.startWave()
        }
      })
      this.spawning = true // prevent multiple schedules until delay passes
    }

    // timer & finish
    const elapsed = time - this.runStart
    const remain = Math.max(0, this.runLimitMs - elapsed)
    const mm = Math.floor(remain / 60000)
    const ss = Math.floor((remain % 60000) / 1000)
    this.timerText.setText(`${mm}:${ss.toString().padStart(2, '0')}`)

    if (remain <= 0 || this.base <= 0) this.finishRun()
  }

  finishRun() {
    if ((this as any)._finished) return
    ;(this as any)._finished = true
    const durationMs = Math.min(this.runLimitMs, this.time.now - this.runStart)
    this.game.events.emit('run_finished', { score: Math.floor(this.score), wave: this.wave, durationMs })
    this.scene.pause()
  }
}
