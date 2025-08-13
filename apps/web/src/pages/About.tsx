import React from 'react'
import { motion } from 'framer-motion'

export default function About(){
  return (
    <motion.div className="page" initial={{opacity:0}} animate={{opacity:1}}>
      <h1>About</h1>

      <div className="about-card">
        <p><strong>Author:</strong> eternaaall — a simple 18-year-old ZK fan from Ukraine.</p>
        <p><strong>GitHub & Discord:</strong> <a href="https://github.com/eternaaall" target="_blank" rel="noreferrer">eternaaall</a></p>
        <p><strong>Twitter:</strong> <a href="https://twitter.com/eternaaall_" target="_blank" rel="noreferrer">@eternaaall_</a></p>
        <p><strong>Scripts for easy Node installation:</strong> <a href="https://github.com/eternaaall/provercysic" target="_blank" rel="noreferrer">Prover</a> / <a href="https://github.com/eternaaall/verifcysic" target="_blank" rel="noreferrer">Verifier</a></p>
        <p><strong>Cysic:</strong> <a href="https://app.cysic.xyz" target="_blank" rel="noreferrer">app.cysic.xyz</a></p>
      </div>

      <p className="love">Made with ♥ for Cysic and the ZK family.</p>
    </motion.div>
  )
}
