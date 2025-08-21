import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

export interface NicknameModalProps {
  onSubmit: (v: string) => void
}

export default function NicknameModal({ onSubmit }: NicknameModalProps){
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
        initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} transition={{duration:.18}}
      />
      <motion.div className="modal" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}>
        <motion.div
          className="modal-card"
          initial={{opacity:0, y:14, scale:.96}}
          animate={{opacity:1, y:0, scale:1}}
          exit={{opacity:0, y:8}}
          transition={{type:'spring', stiffness:280, damping:24}}
        >
          <div className="modal-title">Welcome, ZK builder!</div>

          <label className="modal-label">Enter your nickname:</label>
          <input
            className="modal-input"
            placeholder="e.g. cysic_believer"
            value={nick}
            onChange={e=>setNick(e.target.value)}
            onKeyDown={e=> e.key==='Enter' && save()}
            autoFocus
          />

          <div className="modal-hint">For the best experience, use your PC. You can also play on your mobile device.</div>

          <div className="modal-actions">
            <button className="btn" onClick={save}>Play</button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
