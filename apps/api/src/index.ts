import Fastify from 'fastify'
import cors from '@fastify/cors'
import rateLimit from '@fastify/rate-limit'
import { visitRoutes } from './routes/visit.js'
import { runRoutes } from './routes/run.js'
import { leaderboardRoutes } from './routes/leaderboard.js'
import { seasonRoutes } from './routes/season.js'
import { adminRoutes } from './routes/admin.js'
const app=Fastify({logger:true});await app.register(cors,{origin:true});await app.register(rateLimit,{max:60,timeWindow:'1 minute'});await visitRoutes(app);await runRoutes(app);await leaderboardRoutes(app);await seasonRoutes(app);await adminRoutes(app);const port=process.env.PORT?Number(process.env.PORT):3000;app.listen({port,host:'0.0.0.0'}).then(()=>console.log('API listening on',port))
