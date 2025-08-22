import React, { useEffect, useState } from 'react'
const API_BASE = import.meta.env.VITE_API_BASE

type Row = {
  nickname: string
  score: number
  wave: number
  duration_ms: number
  created_at?: string
}

export default function Leaderboard(){
  const [rows, setRows] = useState<Row[] | null>(null)

  useEffect(() => {
    fetch(`${API_BASE}/api/leaderboard?limit=100`)
      .then(r => r.json())
      .then((data) => setRows(Array.isArray(data) ? data : []))
      .catch(() => setRows([]))
  }, [])

  const isEmpty = rows !== null && rows.length === 0

  return (
    <div>
      <h1>Season Leaderboard</h1>

      {rows === null ? (
        <div className="card"><p>Loading…</p></div>
      ) : isEmpty ? (
        <div className="card">
          <p><strong>It’s empty here for now.</strong></p>
          <p>Play a run and be the first to appear on the board!</p>
        </div>
      ) : (
        <div className="card">
          <table className="lb-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Nickname</th>
                <th>Score</th>
                <th>Wave</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td>{i + 1}</td>
                  <td>{r.nickname ?? 'anon'}</td>
                  <td>{r.score}</td>
                  <td>{r.wave}</td>
                  <td>{formatDuration(r.duration_ms)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function formatDuration(ms: number){
  const s = Math.max(0, Math.round(ms/1000))
  const m = Math.floor(s/60)
  const sec = s % 60
  return `${m}:${sec.toString().padStart(2,'0')}`
}
