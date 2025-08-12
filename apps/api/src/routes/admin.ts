import { FastifyInstance } from 'fastify'
import { env } from '../env.js'
import { z } from 'zod'
import { query } from '../db.js'
export async function adminRoutes(f:FastifyInstance){f.post('/api/admin/reserve-nick',async(req,reply)=>{const auth=req.headers.authorization||'';const token=auth.startsWith('Bearer ')?auth.slice(7):'';if(token!==env.ADMIN_TOKEN)return reply.code(401).send({error:'unauthorized'});const body=z.object({nickname:z.string(),device_id:z.string()}).parse(req.body||{});await query('insert into nick_reservations(nickname, device_id) values ($1,$2) on conflict (nickname) do update set device_id=excluded.device_id',[body.nickname.toLowerCase(),body.device_id]);return{ok:true}})}
