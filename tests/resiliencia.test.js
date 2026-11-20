import test from 'node:test';
import assert from 'node:assert/strict';
import {esTransitorio,errorJson} from '../lib/http.js';
import {interpretar,reiniciarPausasIA} from '../lib/ai.js';
import health from '../api/health.js';

function resFalsa(){const r={cabeceras:{},setHeader(k,v){this.cabeceras[k]=v;},end(c){this.cuerpo=JSON.parse(c);}};return r;}
const json=(obj,status=200,headers={})=>new Response(JSON.stringify(obj),{status,headers});
const buena=(texto='Hola')=>json({choices:[{message:{content:JSON.stringify({accion:'conversar',respuesta_libre:texto})}}]});
function conEntorno(vars,fn){
  reiniciarPausasIA();
  const antes={};for(const k of Object.keys(vars)){antes[k]=process.env[k];if(vars[k]===null)delete process.env[k];else process.env[k]=vars[k];}
  const f=globalThis.fetch;
  return Promise.resolve().then(fn).finally(()=>{globalThis.fetch=f;for(const k of Object.keys(antes)){if(antes[k]===undefined)delete process.env[k];else process.env[k]=antes[k];}});
}

test('Un corte de la base de datos se informa como 503 reintentable, no como error genérico',()=>{
  assert.equal(esTransitorio(new Error('timeout exceeded when trying to connect')),true);
  assert.equal(esTransitorio(Object.assign(new Error('x'),{code:'ECONNRESET'})),true);
  assert.equal(esTransitorio(new Error('syntax error at or near')),false);
  const res=resFalsa();errorJson(res,new Error('Connection terminated unexpectedly'));
  assert.equal(res.statusCode,503);assert.equal(res.cuerpo.reintentable,true);assert.match(res.cuerpo.error,/base de datos/);
  const otro=resFalsa();errorJson(otro,new Error('bug interno'));
  assert.equal(otro.statusCode,500);assert.doesNotMatch(otro.cuerpo.error,/bug interno/);
});
test('Si el modelo principal de Groq llega a su límite (429) responde el modelo de respaldo',()=>conEntorno({GROQ_API_KEY:'clave-de-prueba',GROQ_MODEL:'openai/gpt-oss-120b',GROQ_MODEL_RESPALDO:'openai/gpt-oss-20b'},async()=>{
  const modelos=[];
  globalThis.fetch=async(u,o)=>{const m=JSON.parse(o.body).model;modelos.push(m);return m==='openai/gpt-oss-120b'?json({error:{code:'rate_limit_exceeded'}},429,{'retry-after':'30'}):buena('Hola desde el respaldo');};
  const r=await interpretar('hola asesor',{fecha_hoy:'2026-11-13'});
  assert.deepEqual(modelos,['openai/gpt-oss-120b','openai/gpt-oss-20b']);
  assert.equal(r.motor,'groq');assert.equal(r.respuesta_libre,'Hola desde el respaldo');
}));
test('Un error de autenticación no prueba otro modelo',()=>conEntorno({GROQ_API_KEY:'clave-de-prueba'},async()=>{
  let n=0;globalThis.fetch=async()=>{n++;return json({error:{code:'invalid_api_key'}},401);};
  const r=await interpretar('hola asesor');
  assert.equal(n,1);assert.equal(r.motor,'respaldo_groq');
}));
test('Si Groq no responde a tiempo se usan las reglas y se evitan esperas repetidas',()=>conEntorno({GROQ_API_KEY:'clave-de-prueba',GROQ_TIMEOUT_MS:'40'},async()=>{
  let n=0;
  globalThis.fetch=(u,o)=>{n++;return new Promise((_,rechazo)=>o.signal.addEventListener('abort',()=>rechazo(Object.assign(new Error('abort'),{name:'AbortError'}))));};
  const r=await interpretar('hola asesor');
  assert.equal(n,2);assert.equal(r.motor,'respaldo_groq');assert.match(r.diagnostico_groq,/tiempo de espera/);
  const siguiente=await interpretar('hola de nuevo');
  assert.equal(n,2,'durante la pausa no vuelve a llamar a Groq');assert.equal(siguiente.motor,'respaldo_groq');
}));
test('/api/health informa la configuración sin exponer secretos',()=>conEntorno({DATABASE_URL:null,GROQ_API_KEY:'clave-secreta-123'},async()=>{
  const res=resFalsa();await health({method:'GET',query:{}},res);
  assert.equal(res.statusCode,503);assert.equal(res.cuerpo.variables.DATABASE_URL,false);assert.equal(res.cuerpo.variables.GROQ_API_KEY,true);
  assert.doesNotMatch(JSON.stringify(res.cuerpo),/clave-secreta-123/);
  const mala=resFalsa();await health({method:'POST'},mala);assert.equal(mala.statusCode,405);
}));

test('Si Groq falla se usa DeepSeek de respaldo con JSON y sin razonamiento',()=>conEntorno({GROQ_API_KEY:'clave-groq',DEEPSEEK_API_KEY:'clave-deepseek',DEEPSEEK_MODEL:null},async()=>{
  const llamadas=[];
  globalThis.fetch=async(u,o)=>{llamadas.push({u,auth:o.headers.Authorization,cuerpo:JSON.parse(o.body)});return u.includes('groq')?json({error:{code:'x'}},503):buena('Hola desde DeepSeek');};
  const r=await interpretar('hola asesor',{fecha_hoy:'2026-11-13'});
  const ds=llamadas.at(-1);
  assert.equal(r.motor,'groq');assert.equal(r.proveedor_ia,'deepseek');assert.equal(r.respuesta_libre,'Hola desde DeepSeek');
  assert.equal(ds.u,'https://api.deepseek.com/chat/completions');assert.equal(ds.auth,'Bearer clave-deepseek');
  assert.equal(ds.cuerpo.response_format.type,'json_object');assert.deepEqual(ds.cuerpo.thinking,{type:'disabled'});
  assert.match(JSON.stringify(ds.cuerpo.messages[0].content),/JSON/);
}));
test('Con la clave de Groq inválida se prueba DeepSeek y una respuesta en blanco se descarta',()=>conEntorno({GROQ_API_KEY:'mala',DEEPSEEK_API_KEY:'clave-deepseek'},async()=>{
  let groq=0;
  globalThis.fetch=async(u)=>{if(u.includes('groq')){groq++;return json({error:{code:'invalid_api_key'}},401);}return json({choices:[{message:{content:'    '}}]});};
  const r=await interpretar('hola asesor');
  assert.equal(groq,1,'una clave inválida no se prueba con el otro modelo de Groq');
  assert.equal(r.motor,'respaldo_groq');assert.match(r.diagnostico_groq,/JSON inválida/);
}));
