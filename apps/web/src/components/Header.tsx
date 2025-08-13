import React from 'react'
import { Link, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'

export default function Header(){
  const { pathname } = useLocation()
  const is = (p:string)=> pathname===p

  return (
    <header className="site-header">
      <Link to="/" className="brand">
        <img src="/cysic-logo.png" alt="Cysic" className="brand-logo" />
        <span className="brand-text">Cysic&nbsp;Tower&nbsp;Defense</span>
      </Link>

      <nav className="nav">
        {[
          {to:'/play', label:'Play'},
          {to:'/leaderboard', label:'Leaderboard'},
          {to:'/about', label:'About'},
        ].map(item => (
          <Link key={item.to} to={item.to} className={`nav-link ${is(item.to) ? 'active' : ''}`}>
            <motion.span layoutId={`nav-${item.to}`} className="nav-text">{item.label}</motion.span>
            {is(item.to) && <motion.span layoutId="nav-underline" className="nav-underline" />}
          </Link>
        ))}
      </nav>
    </header>
  )
}
