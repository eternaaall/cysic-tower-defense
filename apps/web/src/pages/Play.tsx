import React, { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Game, AUTO, Scale } from 'phaser'
import NicknameModal from '../components/NicknameModal'
import MainScene from '../phaser/MainScene'

const API_BASE = import.meta.env.VITE_API_BASE as string

async function hmacSHA256(key: string, msg: string) {
  const enc = new TextEncoder()
  const cryptoKey = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(msg))
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('')
}
function getOrCreateDeviceId() {
  let id = localStorage.getItem('device_id')
  if (!id) { id = crypto.randomUUID(); localStorage.setItem('device_id', id) }
  return id
}

export default function Play() {
  const [nick, setNick] = useState<string | null>(localStorage.getItem('nickname'))
  const [isFs, setFs] = useState(false)

  const wrapRef = useRef<HTMLDivElement>(null)
  const surfaceRef = useRef<HTMLDivElement>(null)
  const gameRef = useRef<Game | null>(null)
  const runRef = useRef<{ run_id: string; nonce: string } | null>(null)

  useEffect(() => {
    if (!nick) return
    const deviceId = getOrCreateDeviceId()

    fetch(`${API_BASE}/api/visit`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ device_id: deviceId, tz_offset: new Date().getTimezoneOffset() }),
    }).catch(() => {})

    fetch(`${API_BASE}/api/run/start`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ device_id: deviceId, nickname: nick }),
    })
      .then(r => r.json())
      .then(data => {
        runRef.current = { run_id: data.run_id, nonce: data.nonce }
        if (!gameRef.current && surfaceRef.current) {
          gameRef.current = new Game({
            type: AUTO,
            parent: surfaceRef.current,
            width: 1024,
            height: 576,
            backgroundColor: '#0b0b0f',
            scale: { mode: Scale.FIT, autoCenter: Scale.CENTER_BOTH },
            fps: { target: 144, min: 30, forceSetTimeOut: false },
            physics: { default: 'arcade', arcade: { debug: false } },
            pixelArt: true,
            roundPixels: true,
            scene: [new MainScene(data.seed, data.run_id, data.season, data.nonce)],
          })

          gameRef.current.events.on(
            'run_finished',
            async ({ score, wave, durationMs }: { score: number; wave: number; durationMs: number }) => {
              try {
                const { nonce, run_id } = runRef.current!
                const proof = await hmacSHA256(nonce, `${score}:${wave}:${durationMs}`)
                await fetch(`${API_BASE}/api/run/finish`, {
                  method: 'POST', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ run_id, score, wave, duration_ms: durationMs, build_hash: 'web-iter1.1', proof }),
                })
              } catch (e) { console.error('finish failed', e) }
            }
          )
        }
      })
      .catch(() => { alert('API not reachable yet.') })

    return () => { if (gameRef.current) { gameRef.current.destroy(true); gameRef.current = null } }
  }, [nick])

  const toggleFs = async () => {
    const el = wrapRef.current
    if (!el) return
    try {
      if (!document.fullscreenElement) { await el.requestFullscreen?.(); setFs(true) }
      else { await document.exitFullscreen?.(); setFs(false) }
    } catch (e) { console.error(e) }
  }

  return (
    <div>
      <div className="hero">
        <motion.div className="badge" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
          Cysic Tower Defense
        </motion.div>
        <h1>Defend the ZK pipeline</h1>
      </div>

      {!nick && <NicknameModal onSubmit={(v) => setNick(v)} />}

      <div className="game-wrap shell" ref={wrapRef}>
        <div ref={surfaceRef} className="game-surface" />
        <div className="game-actions">
          {nick && (
            <button className="fullscreen-btn" onClick={toggleFs}>
              {isFs ? 'Exit Fullscreen' : 'Fullscreen'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
