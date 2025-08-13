import Phaser from 'phaser'

type Enemy = Phaser.GameObjects.Arc & { hp:number, speed:number, t:number }
type Tower = Phaser.GameObjects.Arc & { range:number, fireCd:number, fireTimer:number }
type Bullet = Phaser.GameObjects.Arc & { vx:number, vy:number, dmg:number }

function mulberry32(seed:number){ return function(){ let t = seed += 0x6D2B79F5; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296 } }

export default class MainScene extends Phaser.Scene {
  private seed:number; private runId:string; private season:number; private nonce:string
  private rand:()=>number = Math.random
  private path: Phaser.Curves.Path
  private enemies: Enemy[] = []
  private towers: Tower[] = []
  private bullets: Bullet[] = []
  private score = 0
  private wave = 1
  private baseHP = 20
  private startTs = 0
  private maxDuration = 4 * 60 * 1000 // 4 минуты
  private ui!: { score:Phaser.GameObjects.Text, wave:Phaser.GameObjects.Text, base:Phaser.GameObjects.Text, time:Phaser.GameObjects.Text }

  constructor(seed:number, runId:string, season:number, nonce:string){
    super('main'); this.seed=seed; this.runId=runId; this.season=season; this.nonce=nonce
    this.path = new Phaser.Curves.Path(0,0)
  }

  create(){
    this.rand = mulberry32(this.seed|0)
    const w=this.scale.width, h=this.scale.height
    this.add.rectangle(0,0,w,h,0x10131c).setOrigin(0)

    // path: простая змейка слева направо
    const pts = [
      {x: 40, y: h*0.20}, {x: w*0.25, y: h*0.20},
      {x: w*0.25, y: h*0.80}, {x: w*0.75, y: h*0.80},
      {x: w*0.75, y: h*0.35}, {x: w-40, y: h*0.35},
    ]
    this.path = new Phaser.Curves.Path(pts[0].x, pts[0].y)
    for(let i=1;i<pts.length;i++) this.path.lineTo(pts[i].x, pts[i].y)

    const g=this.add.graphics({ lineStyle: { width: 8, color: 0x1d2432 } })
    this.path.draw(g)

    // UI
    this.ui = {
      score: this.add.text(14,14,'Score: 0',{fontFamily:'monospace',fontSize:'16px',color:'#e7e7f2'}),
      wave:  this.add.text(14,34,'Wave: 1',{fontFamily:'monospace',fontSize:'16px',color:'#9aa0aa'}),
      base:  this.add.text(14,54,'Base: 20',{fontFamily:'monospace',fontSize:'16px',color:'#9aa0aa'}),
      time:  this.add.text(w-14,14,'4:00',{fontFamily:'monospace',fontSize:'16px',color:'#e7e7f2'}).setOrigin(1,0),
    }
    this.add.text(w/2, 10, 'Cysic Tower Defense — Prototype', {fontFamily:'monospace', fontSize:'18px', color:'#e7e7f2'}).setOrigin(0.5,0)

    // placing towers
    this.input.on('pointerdown', (p:Phaser.Input.Pointer)=>{
      if(this.towers.length>=10) return
      const pt = new Phaser.Math.Vector2(p.x, p.y)
      // не даём ставить прямо на дорожке (дистанция > 22)
      const nearest = this.path.getPoint( this.path.getTFromDistance(Phaser.Math.Clamp(this.path.getDistanceFromPoint(pt), 0, this.path.getLength())) )
      if(pt.distance(nearest) < 26) return
      const tower = this.add.circle(pt.x, pt.y, 12, 0x8a5cff, 1) as Tower
      tower.range = 120; tower.fireCd = 320; tower.fireTimer = 0
      this.towers.push(tower)
      this.tweens.add({targets:tower, scale:1.2, yoyo:true, duration:150})
    })

    // спавн волн
    this.time.addEvent({ delay: 1200, loop:true, callback:()=>{
      for(let i=0;i<Math.min(3+Math.floor(this.wave/3),6);i++){
        this.time.delayedCall(i*250, ()=> this.spawnEnemy(), undefined, this)
      }
      this.wave++
      this.ui.wave.setText(`Wave: ${this.wave}`)
    }})

    this.startTs = performance.now()
  }

  private spawnEnemy(){
    const e = this.add.circle(0,0,9,0x00e0ff,1) as Enemy
    e.hp = 20 + this.wave*4
    e.speed = 40 + this.wave*2   // пикс/сек
    e.t = 0
    this.enemies.push(e)
    this.path.getPoint(0, e) // поставить на начало
  }

  private endRun(reason:'timeout'|'base_down'){
    const duration = Math.floor(performance.now() - this.startTs)
    // сообщаем React-обёртке через событие игры
    this.game.events.emit('run_finished', { score:this.score, wave:Math.max(1,this.wave-1), durationMs:duration })
    this.scene.pause()
    const msg = reason==='timeout' ? 'Time!' : 'Base down!'
    this.add.text(this.scale.width/2, this.scale.height/2, `${msg}\nScore ${this.score}`, {fontFamily:'monospace',fontSize:'22px',color:'#e7e7f2',align:'center'}).setOrigin(0.5)
  }

  update(_t:number, dtMs:number){
    const dt = dtMs/1000

    // таймер 4 минуты
    const left = Math.max(0, this.maxDuration - (performance.now()-this.startTs))
    const mm = Math.floor(left/60000), ss = Math.floor((left%60000)/1000)
    this.ui.time.setText(`${mm}:${ss.toString().padStart(2,'0')}`)
    if(left<=0){ this.endRun('timeout'); return }

    // апдейт врагов (движение по пути)
    for(const e of this.enemies){
      const len = this.path.getLength()
      const inc = e.speed * dt
      const cur = this.path.getPoint(e.t)
      const curDist = this.path.getDistanceFromPoint(cur)
      const t = this.path.getTFromDistance(Math.min(len, curDist + inc))
      e.t = t
      const p = this.path.getPoint(t)
      e.setPosition(p.x, p.y)

      if(t>=1){
        e.destroy()
        this.baseHP -= 1
        this.ui.base.setText(`Base: ${this.baseHP}`)
      }
    }
    // удалить врагов у базы или мёртвых
    this.enemies = this.enemies.filter(e=> e.active && e.hp>0)

    if(this.baseHP<=0){ this.endRun('base_down'); return }

    // башни: поиск цели и выстрел
    for(const t of this.towers){
      t.fireTimer -= dtMs
      if(t.fireTimer<=0){
        const target = this.enemies.find(e=> Phaser.Math.Distance.Between(t.x,t.y,e.x,e.y) <= t.range)
        if(target){
          const ang = Math.atan2(target.y - t.y, target.x - t.x)
          const b = this.add.circle(t.x, t.y, 4, 0xffffff, 1) as Bullet
          const speed = 320
          b.vx = Math.cos(ang)*speed
          b.vy = Math.sin(ang)*speed
          b.dmg = 12
          this.bullets.push(b)
          t.fireTimer = t.fireCd
        }
      }
    }

    // пули
    for(const b of this.bullets){
      b.x += b.vx * dt
      b.y += b.vy * dt
      // столкновение
      for(const e of this.enemies){
        if(!e.active) continue
        if(Phaser.Math.Distance.Between(b.x,b.y,e.x,e.y) < (b.radius + e.radius)){
          e.hp -= b.dmg
          b.destroy()
          b.active=false
          if(e.hp<=0){
            e.destroy()
            this.score += 10 + Math.floor(this.wave/2)
            this.ui.score.setText(`Score: ${this.score}`)
          }
          break
        }
      }
      // оффскрин
      if(b.x< -20 || b.y< -20 || b.x>this.scale.width+20 || b.y>this.scale.height+20){
        b.destroy(); b.active=false
      }
    }
    this.bullets = this.bullets.filter(b=>b.active)
  }
}
