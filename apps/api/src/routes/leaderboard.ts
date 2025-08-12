import { FastifyInstance } from 'fastify'
import { query } from '../db.js'
import { z } from 'zod'
export async function leaderboardRoutes(f:FastifyInstance){f.get('/api/leaderboard',async(req,reply)=>{const q=z.object({limit:z.coerce.number().min(1).max(200).default(100)}).parse((req.query||{}) as any);const res=await query(`with ranked as (select u.nickname,r.score,row_number() over (partition by u.nickname order by r.score desc) rn from runs r join users u on u.id=r.user_id) select nickname,score from ranked where rn=1 order by score desc limit $1`,[q.limit]);return res.rows})}
