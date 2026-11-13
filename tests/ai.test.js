import test from 'node:test';
import assert from 'node:assert/strict';
import {respaldo,respuestaRespaldo,interpretar} from '../lib/ai.js';

test('small talk tiene una respuesta apropiada y no un mensaje repetido',()=>{
  assert.match(respuestaRespaldo('estoy triste'),/Lamento/);
  assert.match(respuestaRespaldo('hola soy un tanque volador'),/presentación/);
  assert.notEqual(respuestaRespaldo('estoy triste'),respuestaRespaldo('hola'));
});
test('catálogo y cotizaciones mantienen clasificación útil',()=>{
  assert.equal(respaldo('quiero productos').accion,'catalogo');
  assert.equal(respaldo('necesito 300 cajas de UHT').accion,'cotizar');
  assert.equal(respaldo('necesito 300 cajas de UHT').cantidad,300);
  assert.equal(respaldo('necesito 300 cajas de UHT').producto,'PRD-001');
  assert.equal(respaldo('dame 8% de descuento').accion,'descuento');
});
test('sin API mantiene conversación contextual sin inventar stock',async()=>{
  const before=process.env.GROQ_API_KEY;
  delete process.env.GROQ_API_KEY;
  try {
    const d=await interpretar('me siento triste',{cliente:'La Alameda',historial:[]});
    assert.equal(d.accion,'conversar');assert.equal(d.motor,'reglas_sin_groq');
    assert.match(d.respuesta_libre,/Lamento/);
  } finally {
    if(before!==undefined)process.env.GROQ_API_KEY=before;
  }
});

test('Groq usa esquema estricto y reintenta una vez cuando falla la validación JSON',async()=>{
 const key=process.env.GROQ_API_KEY,model=process.env.GROQ_MODEL,original=globalThis.fetch;
 process.env.GROQ_API_KEY='clave-de-prueba';process.env.GROQ_MODEL='openai/gpt-oss-120b';
 let calls=[];
 globalThis.fetch=async(url,opts)=>{
   calls.push(JSON.parse(opts.body));
   if(calls.length===1)return new Response(JSON.stringify({error:{code:'json_validate_failed'}}),{status:400,headers:{'Content-Type':'application/json'}});
   return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({accion:'conversar',respuesta_libre:'Hola, ¿cómo te ayudo?'})}}]}),{status:200,headers:{'Content-Type':'application/json'}});
 };
 try{
   const r=await interpretar('hola asesor',{fecha_hoy:'2026-11-13'});
   assert.equal(r.motor,'groq');assert.equal(r.respuesta_libre,'Hola, ¿cómo te ayudo?');
   assert.equal(calls.length,2);assert.equal(calls[0].response_format.type,'json_schema');
   assert.equal(calls[0].response_format.json_schema.strict,true);
 }finally{globalThis.fetch=original;if(key===undefined)delete process.env.GROQ_API_KEY;else process.env.GROQ_API_KEY=key;if(model===undefined)delete process.env.GROQ_MODEL;else process.env.GROQ_MODEL=model;}
});
test('Groq no reintenta un fallo de autenticación',async()=>{
 const key=process.env.GROQ_API_KEY,original=globalThis.fetch;process.env.GROQ_API_KEY='clave-de-prueba';let calls=0;
 globalThis.fetch=async()=>{calls++;return new Response(JSON.stringify({error:{code:'invalid_api_key'}}),{status:401});};
 try{const r=await interpretar('hola asesor');assert.equal(calls,1);assert.equal(r.motor,'respaldo_groq');assert.match(r.diagnostico_groq,/401/);}
 finally{globalThis.fetch=original;if(key===undefined)delete process.env.GROQ_API_KEY;else process.env.GROQ_API_KEY=key;}
});
test('Tras dos respuestas JSON inválidas informa el problema sin exponer el contenido del error',async()=>{
 const key=process.env.GROQ_API_KEY,original=globalThis.fetch;process.env.GROQ_API_KEY='clave-de-prueba';let calls=0;
 globalThis.fetch=async()=>{calls++;return new Response(JSON.stringify({error:{code:'json_validate_failed',failed_generation:'texto privado'}}),{status:400});};
 try{const r=await interpretar('hola asesor');assert.equal(calls,2);assert.equal(r.motor,'respaldo_groq');assert.match(r.diagnostico_groq,/json_validate_failed/);assert.doesNotMatch(JSON.stringify(r),/texto privado|clave-de-prueba/);}
 finally{globalThis.fetch=original;if(key===undefined)delete process.env.GROQ_API_KEY;else process.env.GROQ_API_KEY=key;}
});
test('tool_use_failed intenta una sola vez con JSON alternativo sin usar herramientas',async()=>{
 const key=process.env.GROQ_API_KEY,model=process.env.GROQ_MODEL,original=globalThis.fetch;
 process.env.GROQ_API_KEY='clave-de-prueba';process.env.GROQ_MODEL='openai/gpt-oss-20b';const llamadas=[];
 globalThis.fetch=async(url,opts)=>{
  llamadas.push(JSON.parse(opts.body));
  if(llamadas.length===1)return new Response(JSON.stringify({error:{code:'tool_use_failed',failed_generation:'privado'}}),{status:400});
  return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({accion:'conversar',respuesta_libre:'Hola, te escucho.'})}}]}),{status:200});
 };
 try{const r=await interpretar('soy un tigre que quiere galletas');
  assert.equal(r.motor,'groq');assert.equal(llamadas.length,2);
  assert.equal(llamadas[0].response_format.type,'json_schema');assert.equal(llamadas[1].response_format.type,'json_object');
  assert.equal(llamadas[1].temperature,0.1);assert.equal(llamadas[1].tools,undefined);
  assert.doesNotMatch(JSON.stringify(r),/privado|clave-de-prueba/);
 }finally{globalThis.fetch=original;if(key===undefined)delete process.env.GROQ_API_KEY;else process.env.GROQ_API_KEY=key;if(model===undefined)delete process.env.GROQ_MODEL;else process.env.GROQ_MODEL=model;}
});
