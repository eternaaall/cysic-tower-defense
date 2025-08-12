import { FastifyInstance } from 'fastify'
import { env } from '../env.js'
export async function seasonRoutes(f:FastifyInstance){f.get('/api/season',async()=>{const start=new Date();start.setUTCHours(0,0,0,0);const seasonId=Math.floor(start.getTime()/(env.SEASON_LENGTH_DAYS*24*3600*1000));const ends=new Date(start);ends.setUTCDate(ends.getUTCDate()+env.SEASON_LENGTH_DAYS);return{id:seasonId,starts_at:start.toISOString(),ends_at:ends.toISOString()}})}
