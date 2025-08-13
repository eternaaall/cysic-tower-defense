import React, { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import NicknameModal from '../components/NicknameModal'
import { Game, AUTO, Scale } from 'phaser'
import MainScene from '../phaser/MainScene'
const API_BASE = import.meta.env.VITE_API_BASE

async function hmacSHA256(key:string, msg:string){
  const enc = new TextEncoder()
  const cryptoKey = await crypto.subtle.importKey('raw', enc.encode(key), {name:'HMAC', hash:'SHA-256'}, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(msg))
  return Array.from(new Uint8Array(sig)).map(b=>b.toString(16).padStart(2,'0')).join('')
}

export default function Play(){
  const [nick,setNick]=useState<string|null>(localStorage.getItem('nickname'))
  const ref=useRef<HTMLDivElement>(null); const gameRef=useRef<Game|null>(null)
  const runRef=useRef<{run_id:string, nonce:string} | null>(null)

  useEffect(()=>{ if(!nick) return;
    const deviceId=getOrCreateDeviceId()
    // старт забега
    fetch(`${API_BASE}/api/run/start`,{
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({device_id:deviceId,nickname:nick})
    }).then(r=>r.json()).then(async data=>{
      runRef.current = { run_id: data.run_id, nonce: data.nonce }
      if(!gameRef.current && ref.current){
        gameRef.current = new Game({
          type:AUTO, parent:ref.current, width:1024, height:576, backgroundColor:'#0b0b0f', pixelArt:false,
          scale:{ mode:Scale.FIT, autoCenter:Scale.CENTER_BOTH },
          fps:{ target:60, min:30, forceSetTimeOut:false },
          physics:{ default:'arcade', arcade:{ debug:false } },
          scene:[ new MainScene(data.seed, data.run_id, data.season, data.nonce) ]
        })
        // ловим событие завершения из сцены
        gameRef.current.events.on('run_finished', async ({score, wave, durationMs}:{score:number,wave:number,durationMs:number})=>{
          try{
            const nonce = runRef.current!.nonce
            const run_id = runRef.current!.run_id
            const proof = await hmacSHA256(nonce, `${score}:${wave}:${durationMs}`)
            await fetch(`${API_BASE}/api/run/finish`,{
              method:'POST', headers:{'Content-Type':'application/json'},
              body:JSON.stringify({ run_id, score, wave, duration_ms: durationMs, build_hash:'web-mvp-0.1', proof })
            })
          }catch(e){ console.error('finish failed', e) }
        })
      }
    }).catch(()=>alert('API not reachable yet.'))

    // счетчик визитов (best effort)
    fetch(`${API_BASE}/api/visit`,{
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({device_id:deviceId,tz_offset:new Date().getTimezoneOffset()})
    }).catch(()=>{})

  },[nick])

  return (<div>
    <div className="hero">
      <motion.div className="badge" initial={{opacity:0,y:-10}} animate={{opacity:1,y:0}}>Cysic Tower Defense</motion.div>
      <h1>Defend the ZK pipeline</h1>
      <p className="note">Best on desktop. Playable on mobile. Uncapped rendering for smooth 120/144 Hz displays.</p>
    </div>
    {!nick && <NicknameModal onSubmit={setNick}/>}
    <div className="banner">Cysic: <a href="https://app.cysic.xyz/userPortal" target="_blank" rel="noreferrer">app.cysic.xyz/userPortal</a></div>
    <div ref={ref} style={{width:'100%',aspectRatio:'16/9',borderRadius:16,overflow:'hidden',border:'1px solid rgba(255,255,255,.06)',background:'#0b0b0f'}}/>
  </div>)
}
function getOrCreateDeviceId(){ let id=localStorage.getItem('device_id'); if(!id){ id=crypto.randomUUID(); localStorage.setItem('device_id',id) } return id }
