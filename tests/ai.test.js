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
