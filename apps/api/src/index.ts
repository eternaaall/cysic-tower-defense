import Fastify from 'fastify'
import cors from '@fastify/cors'
import { visitRoutes } from './routes/visit.js'
import { runRoutes } from './routes/run.js'
import { leaderboardRoutes } from './routes/leaderboard.js'
import { seasonRoutes } from './routes/season.js'
import { adminRoutes } from './routes/admin.js'

async function start(){
  const app = Fastify({ logger: true })

  await app.register(cors, { origin: true })

  await visitRoutes(app)
  await runRoutes(app)
  await leaderboardRoutes(app)
  await seasonRoutes(app)
  await adminRoutes(app)

  const port = process.env.PORT ? Number(process.env.PORT) : 3000
  await app.listen({ port, host: '0.0.0.0' })
  console.log('API listening on', port)
}

start().catch(err => { console.error(err); process.exit(1) })
