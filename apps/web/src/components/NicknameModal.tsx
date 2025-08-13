import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

export default function NicknameModal({ onSubmit }:{ onSubmit:(v:string)=>void }){
  const [nick,setNick]=useState('')

  const save=()=>{
    const v=nick.trim()
    if(!v) return
    localStorage.setItem('nickname', v)
    onSubmit(v)
  }

  return (
    <AnimatePresence>
      <motion.div
        className="modal-backdrop"
        initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} transition={{duration:.2}}
      />
      <motion.div
        className="modal"
        initial={{opacity:0, scale:.96, y:10}} animate={{opacity:1, scale:1, y:0}} exit={{opacity:0, y:10}} transition={{type:'spring', stiffness:220, damping:24}}
      >
        <div className="modal-title">Welcome, Operator</div>
        <div className="modal-sub">For the best experience, use your PC. You can also play on your mobile device.</div>

        <label className="modal-label">Enter your nickname</label>
        <input
          className="modal-input"
          placeholder="e.g. eternaaall"
          value={nick}
          onChange={e=>setNick(e.target.value)}
          onKeyDown={e=> e.key==='Enter' && save()}
          autoFocus
        />

        <div className="modal-actions">
          <button className="btn" onClick={save}>Play</button>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}
