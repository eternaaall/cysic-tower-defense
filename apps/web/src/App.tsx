import React from 'react'
import { Outlet, Link, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'

export default function App() {
  const { pathname } = useLocation()
  const is = (p: string) => pathname === p

  const items = [
    { to: '/play', label: 'Play' },
    { to: '/leaderboard', label: 'Leaderboard' },
    { to: '/about', label: 'About' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      <header className="site-header">
        <div className="shell bar">
          <Link to="/play" className="brand">
            <img src="/cysic-logo.png" alt="Cysic" className="brand-logo" />
            <span className="brand-text">Cysic&nbsp;Tower&nbsp;Defense</span>
          </Link>

          <nav className="nav">
            {items.map((it) => (
              <Link key={it.to} to={it.to} className={`nav-link ${is(it.to) ? 'active' : ''}`}>
                <span className="nav-text">{it.label}</span>
                {is(it.to) && <motion.span layoutId="nav-underline" className="nav-underline" />}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      {/* Контент страниц */}
      <div className="page">
        <Outlet />
      </div>
    </div>
  )
}
