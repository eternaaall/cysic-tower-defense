import Phaser from 'phaser'

type Enemy = Phaser.GameObjects.Arc & { hp:number, speed:number, dist:number }
type Tower = Phaser.GameObjects.Arc & { range:number, fireCd:number, fireTimer:number }
type Bullet = Phaser.GameObjects.Arc & { vx:number, vy:number, dmg:number }

function mulberry32(seed:number){ return function(){ let t = seed += 0x6D2B79F5; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296 } }

// геометрия на ломаной
function segLen(ax:number,ay:number,bx:number,by:number){ const dx=bx-ax, dy=by-ay; return Math.hypot(dx,dy) }
function pointAt(ax:number,ay:number,bx:number,by:number,t:number){ return { x: ax + (bx-ax)*t, y: ay + (by-ay)*t } }
function distPointToSeg(px:number,py:number, ax:number,ay:number, bx:number,by:number){
  const vx=bx-ax, vy=by-ay; const wx=px-ax, wy=py-ay; const vv=vx*vx+vy*vy||1e-6
  let t=(vx*wx+vy*wy)/vv; t=Math.max(0,Math.min(1,t))
  const qx=ax+vx*t, qy=ay+vy*t
  return Math.hypot(px-qx,py-qy)
}

export default class MainScene extends Phaser.Scene{
  private seed:number; private runId:string; private season:number; private nonce:string
  private rand:()=>number = Math.random
  private pts:{x:number,y:number}[]=[]
  private lens:number[]=[]; private total=0
  private enemies: Enemy[]=[]; private towers: Tower[]=[]; private bullets: Bullet[]=[]
  private score=0; private wave=1; private baseHP=20
  private startTs=0; private maxDuration=4*60*1000
  private ui!: { score:Phaser.GameObjects.Text, wave:Phaser.GameObjects.Text, base:Phaser.GameObjects.Text, time:Phaser.GameObjects.Text }

  constructor(seed:number, runId:string, season:number, nonce:string){ super('main'); this.seed=seed; this.runId=runId; this.season=season; this.nonce=nonce }

  private buildPath(){
    const w=this.scale.width, h=this.scale.height
    this.pts = [
      {x: 40, y: h*0.20}, {x: w*0.25, y: h*0.20},
      {x: w*0.25, y: h*0.80}, {x: w*0.75, y: h*0.80},
      {x: w*0.75, y: h*0.35}, {x: w-40, y: h*0.35},
    ]
    this.lens=[]; this.total=0
    for(let i=1;i<this.pts.length;i++){ const L=segLen(this.pts[i-1].x,this.pts[i-1].y,this.pts[i].x,this.pts[i].y); this.lens.push(L); this.total+=L }
    const g=this.add.graphics({ lineStyle:{ width:8, color:0x1d2432 } })
    g.beginPath(); g.moveTo(this.pts[0].x,this.pts[0].y)
    for(let i=1;i<this.pts.length;i++) g.lineTo(this.pts[i].x,this.pts[i].y)
    g.strokePath()
  }

  private getPointAtDistance(d:number){ // d∈[0,total]
    let left=d
    for(let i=1;i<this.pts.length;i++){
      const L=this.lens[i-1]
      if(left<=L){ const t=left/L; return pointAt(this.pts[i-1].x,this.pts[i-1].y,this.pts[i].x,this.pts[i].y,t) }
      left-=L
    }
    return { ...this.pts[this.pts.length-1] }
  }
  private minDistToPath(p:{x:number,y:number}){
    let best=1e9
    for(let i=1;i<this.pts.length;i++){
      best=Math.min(best, distPointToSeg(p.x,p.y, this.pts[i-1].x,this.pts[i-1].y, this.pts[i].x,this.pts[i].y))
    }
    return best
  }

  create(){
    this.rand = mulberry32(this.seed|0)
    const w=this.scale.width, h=this.scale.height
    this.add.rectangle(0,0,w,h,0x10131c).setOrigin(0)
    this.buildPath()

    this.ui = {
      score: this.add.text(14,14,'Score: 0',{fontFamily:'monospace',fontSize:'16px',color:'#e7e7f2'}),
      wave:  this.add.text(14,34,'Wave: 1',{fontFamily:'monospace',fontSize:'16px',color:'#9aa0aa'}),
      base:  this.add.text(14,54,'Base: 20',{fontFamily:'monospace',fontSize:'16px',color:'#9aa0aa'}),
      time:  this.add.text(w-14,14,'4:00',{fontFamily:'monospace',fontSize:'16px',color:'#e7e7f2'}).setOrigin(1,0),
    }
    this.add.text(w/2,10,'Cysic Tower Defense — Prototype',{fontFamily:'monospace',fontSize:'18px',color:'#e7e7f2'}).setOrigin(0.5,0)

    // ставим башни кликом, не ближе 26px к дороге
    this.input.on('pointerdown',(p:Phaser.Input.Pointer)=>{
      if(this.towers.length>=10) return
      const pt={x:p.x,y:p.y}
      if(this.minDistToPath(pt)<26) return
      const t=this.add.circle(pt.x,pt.y,12,0x8a5cff,1) as Tower
      t.range=120; t.fireCd=320; t.fireTimer=0
      this.towers.push(t)
      this.tweens.add({targets:t,scale:1.2,yoyo:true,duration:150})
    })

    // волны
    this.time.addEvent({delay:1200,loop:true,callback:()=>{
      for(let i=0;i<Math.min(3+Math.floor(this.wave/3),6);i++)
        this.time.delayedCall(i*250,()=>this.spawnEnemy())
      this.wave++; this.ui.wave.setText(`Wave: ${this.wave}`)
    }})

    this.startTs=performance.now()
  }

  private spawnEnemy(){
    const e=this.add.circle(this.pts[0].x,this.pts[0].y,9,0x00e0ff,1) as Enemy
    e.hp=20+this.wave*4; e.speed=40+this.wave*2; e.dist=0
    this.enemies.push(e)
  }

  private endRun(reason:'timeout'|'base_down'){
    const duration=Math.floor(performance.now()-this.startTs)
    this.game.events.emit('run_finished',{score:this.score,wave:Math.max(1,this.wave-1),durationMs:duration})
    this.scene.pause()
    const msg = reason==='timeout' ? 'Time!' : 'Base down!'
    this.add.text(this.scale.width/2,this.scale.height/2,`${msg}\nScore ${this.score}`,{fontFamily:'monospace',fontSize:'22px',color:'#e7e7f2',align:'center'}).setOrigin(0.5)
  }

  update(_t:number,dtMs:number){
    const dt=dtMs/1000

    // таймер
    const left=Math.max(0,this.maxDuration-(performance.now()-this.startTs))
    const mm=Math.floor(left/60000), ss=Math.floor((left%60000)/1000)
    this.ui.time.setText(`${mm}:${ss.toString().padStart(2,'0')}`)
    if(left<=0){ this.endRun('timeout'); return }

    // враги движутся вдоль ломаной
    for(const e of this.enemies){
      e.dist += e.speed*dt
      if(e.dist>=this.total){
        e.destroy(); e.active=false
        this.baseHP -= 1; this.ui.base.setText(`Base: ${this.baseHP}`)
      }else{
        const p=this.getPointAtDistance(e.dist)
        e.setPosition(p.x,p.y)
      }
    }
    this.enemies=this.enemies.filter(e=>e.active && e.hp>0)
    if(this.baseHP<=0){ this.endRun('base_down'); return }

    // башни
    for(const t of this.towers){
      t.fireTimer -= dtMs
      if(t.fireTimer<=0){
        const target=this.enemies.find(e=>Phaser.Math.Distance.Between(t.x,t.y,e.x,e.y)<=t.range)
        if(target){
          const ang=Math.atan2(target.y-t.y,target.x-t.x)
          const b=this.add.circle(t.x,t.y,4,0xffffff,1) as Bullet
          const speed=320; b.vx=Math.cos(ang)*speed; b.vy=Math.sin(ang)*speed; b.dmg=12
          this.bullets.push(b); t.fireTimer=t.fireCd
        }
      }
    }

    // пули
    for(const b of this.bullets){
      b.x += b.vx*dt; b.y += b.vy*dt
      for(const e of this.enemies){
        if(!e.active) continue
        const br=(b as any).radius ?? 4, er=(e as any).radius ?? 9
        if(Phaser.Math.Distance.Between(b.x,b.y,e.x,e.y) < (br+er)){
          e.hp -= b.dmg; b.destroy(); b.active=false
          if(e.hp<=0){ e.destroy(); this.score += 10 + Math.floor(this.wave/2); this.ui.score.setText(`Score: ${this.score}`) }
          break
        }
      }
      if(b.x<-20||b.y<-20||b.x>this.scale.width+20||b.y>this.scale.height+20){ b.destroy(); b.active=false }
    }
    this.bullets=this.bullets.filter(b=>b.active)
  }
}
