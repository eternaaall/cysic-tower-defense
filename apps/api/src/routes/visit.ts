import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { query } from '../db.js'
export async function visitRoutes(f:FastifyInstance){f.post('/api/visit',async(req,reply)=>{const body=z.object({device_id:z.string(),tz_offset:z.number().optional(),user_agent:z.string().optional()}).parse(req.body||{});const day=new Date().toISOString().slice(0,10);await query('insert into visits(day, device_id, user_agent, tz_offset) values ($1,$2,$3,$4)',[day,body.device_id,req.headers['user-agent']||null,body.tz_offset??null]).catch(()=>{});return{ok:true}})}
