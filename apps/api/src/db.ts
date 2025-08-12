import pg from 'pg'
import { env } from './env.js'
export const pool=new pg.Pool({connectionString:env.DATABASE_URL})
export async function query(q:string,params?:any[]){const c=await pool.connect();try{return await c.query(q,params)}finally{c.release()}}
