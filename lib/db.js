import pg from 'pg';
import { AsyncLocalStorage } from 'node:async_hooks';
import { falla,esTransitorio } from './http.js';
import {ejecutarEnEscenarioPC3} from './escenario.js';

// CONTEXTO DE SESIÓN: cada request trabaja en su propio esquema PostgreSQL.
// Se usa SET LOCAL dentro de transacciones para compatibilidad con Supabase Transaction Pooler (6543).
const contexto = new AsyncLocalStorage();
let pool;
const formatoUuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function getPool(){
  if(!process.env.DATABASE_URL) falla('Falta configurar DATABASE_URL en Vercel.',503);
  if(!pool){
    pool=new pg.Pool({connectionString:process.env.DATABASE_URL,max:3,idleTimeoutMillis:20000,connectionTimeoutMillis:8000,query_timeout:15000,keepAlive:true});
    // Sin este manejador, una conexión inactiva cortada por el pooler tumba la función.
    pool.on('error',e=>console.error('pg pool (conexión inactiva):',e.message));
  }
  return pool;
}
const esperar=ms=>new Promise(r=>setTimeout(r,ms));
// Solo se reintenta ABRIR la conexión (aún no se ejecutó nada), por lo que nunca duplica una operación.
async function conectar(){
  try{return await getPool().connect();}
  catch(e){if(!esTransitorio(e))throw e;await esperar(400);return getPool().connect();}
}
// Consultas de una sola sentencia e idempotentes (preparar la sesión demo).
async function consultaSimple(sql,values){
  try{return await getPool().query(sql,values);}
  catch(e){if(!esTransitorio(e))throw e;await esperar(400);return getPool().query(sql,values);}
}
function esquema(){
  const actual=contexto.getStore();
  if(!actual)falla('Esta operación requiere una sesión de demostración.',400);
  return actual;
}
function setLocal(sc){return `SET LOCAL search_path TO "${sc}", public`;}

export async function enSimulacion(req,funcion){
  const id=req.headers['x-demo-session'];
  if(typeof id!=='string'||!formatoUuid.test(id))falla('Sesión demo ausente o inválida. Recarga la aplicación.',400);
  const sc='demo_'+id.replaceAll('-','').toLowerCase();
  // Creación/sincronización: no cambia los datos maestros del esquema public.
  await consultaSimple('SELECT public.demo_iniciar($1::uuid) AS esquema',[id]);
  const pc3=req.headers['x-demo-scenario']==='pc3';
  if(pc3) await consultaSimple('SELECT public.demo_pc3_configurar($1::uuid)',[id]);
  return contexto.run(sc,()=>ejecutarEnEscenarioPC3(pc3,funcion));
}

// Las consultas sencillas usan su propia transacción.
// Es importante NO hacer SET search_path fuera de una transacción en el pooler de Supabase.
async function query(sql,values=[]){
  const sc=esquema();const cn=await conectar();
  try{
    await cn.query('BEGIN');
    await cn.query(setLocal(sc));
    const r=await cn.query(sql,values);
    await cn.query('COMMIT');
    return r;
  }catch(e){try{await cn.query('ROLLBACK');}catch{}throw e;}
  finally{cn.release();}
}
// Los procesos multietapa del service.js (alta y pedidos) ya usan BEGIN/COMMIT.
// Inyectamos SET LOCAL justo al iniciar esa transacción, sin modificar sus sentencias SQL.
async function connect(){
  const sc=esquema();const cn=await conectar();let inTx=false;
  return {
    async query(sql,values){
      const normal=String(sql).trim().replace(/;$/,'').toUpperCase();
      if(normal==='BEGIN'){
        const r=await cn.query('BEGIN');
        try{await cn.query(setLocal(sc));inTx=true;return r;}
        catch(e){await cn.query('ROLLBACK');throw e;}
      }
      if(normal==='COMMIT'||normal==='ROLLBACK'){inTx=false;return cn.query(sql,values);}
      if(!inTx)throw new Error('Consulta transaccional fuera de BEGIN.');
      return cn.query(sql,values);
    },
    release(){cn.release();}
  };
}
// Comprobación de salud: solo mide la latencia de un SELECT 1.
export async function pingBaseDatos(){const t=Date.now();await consultaSimple('SELECT 1');return Date.now()-t;}
export function db(){return {query,connect};}
export async function consulta(sql,values=[]){return (await query(sql,values)).rows;}
export async function uno(sql,values=[]){return (await consulta(sql,values))[0]||null;}
