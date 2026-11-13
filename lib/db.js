import pg from 'pg';
import { falla } from './http.js';
let pool;
export function db() {
  if (!process.env.DATABASE_URL) falla('Falta configurar DATABASE_URL en Vercel.',503);
  if (!pool) pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 3, idleTimeoutMillis: 20000, connectionTimeoutMillis: 10000 });
  return pool;
}
export async function consulta(sql, values=[]) { return (await db().query(sql, values)).rows; }
export async function uno(sql, values=[]) { return (await consulta(sql,values))[0] || null; }
