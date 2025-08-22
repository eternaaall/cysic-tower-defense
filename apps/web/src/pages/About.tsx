import React from 'react'
import { motion } from 'framer-motion'

export default function About(){
  return (
    <motion.div className="page" initial={{opacity:0}} animate={{opacity:1}}>
      <h1>About</h1>

      <div className="about-card">
        <p><strong>Author:</strong> eternaaall — a simple 18-year-old ZK fan from Ukraine. I work at a factory and enjoy crypto. Look for <b>eternaaall</b> on all social networks.</p>
        <p><strong>My Linktr:</strong> <a href="https://linktr.ee/eternaaall" target="_blank" rel="noreferrer">https://linktr.ee/eternaaall</a></p>
        <p><strong>Discord:</strong> eternaaall</p>
        <p><strong>My scripts for easy node installation:</strong> <a href="https://github.com/eternaaall/provercysic" target="_blank" rel="noreferrer">Prover</a> / <a href="https://github.com/eternaaall/verifcysic" target="_blank" rel="noreferrer">Verifier</a></p>
        <p><strong>Cysic:</strong> <a href="https://app.cysic.xyz" target="_blank" rel="noreferrer">app.cysic.xyz</a></p>
      </div>

      <p className="love">Made with love for Cysic and ZK family.</p>
    </motion.div>
  )
}
