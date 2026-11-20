import test from 'node:test';
import assert from 'node:assert/strict';
import {leerTurno,esAceptacionEntrega,esConfirmacionCorta,esNegacion} from '../lib/dialogo.js';
import {fechaEscrita,respaldo} from '../lib/ai.js';

// Conversación real de la prueba (hoy = jueves 19/11/2026). Cada caso falló antes por el motor de reglas, no por lo que escribió la persona.
const hoy='2026-11-19';
const q={id_cotizacion:'x',id_producto:'PRD-002',items:[{id_producto:'PRD-002',cantidad:50},{id_producto:'PRD-003',cantidad:20}],
  entregas:[{cajas:50,id_producto:'PRD-002',fecha:'2026-11-21'},{cajas:20,id_producto:'PRD-003',fecha:'2026-11-21'}],entrega_aceptada:false};
const turno=(texto,esperando)=>leerTurno(texto,{estado:{hoy,esperando,producto:'PRD-002'},cotizacion:q,interpretacion:respaldo(texto,{fecha_hoy:hoy})});

test('«El sábado de la siguiente semana» es el 28, no el sábado de esta semana',()=>{
  for(const texto of ['el sabado de la sgte. semana puede ser?','el sábado de la siguiente semana','la proxima semana, el dia sabado','quiero la prox. semana, el dia sabado por favor'])
    assert.equal(fechaEscrita(texto,hoy),'2026-11-28',texto);
  assert.equal(fechaEscrita('el sabado',hoy),'2026-11-21','sin «semana siguiente» es el próximo sábado');
  assert.equal(fechaEscrita('el lunes de la próxima semana',hoy),'2026-11-23');
});
test('«No quiero para el 21, sino para el 28» entiende la fecha nueva',()=>{
  const t=turno('no quiero para el 21, si no para el 28','ACEPTAR_ENTREGA');
  assert.equal(t.accion,'FECHA');assert.equal(t.fecha,'2026-11-28');
  assert.equal(fechaEscrita('lo quiero para el 28',hoy),'2026-11-28');
  assert.equal(fechaEscrita('quiero el 20% de descuento',hoy),null,'un porcentaje no es una fecha');
  assert.equal(fechaEscrita('para el 50 cajas',hoy),null);
});
test('Rechazar la propuesta y pedir otro día no la da por aceptada ni la repite',()=>{
  const t=turno('la rechazo, quiero la prox. semana, el dia sabado por favor','ACEPTAR_ENTREGA');
  assert.equal(t.fecha,'2026-11-28');assert.notEqual(t.fecha,'2026-11-21');
  assert.equal(esNegacion('la rechazo'),true);assert.equal(esNegacion('no acepto'),true);
});
test('Distintas formas de aceptar la entrega se entienden',()=>{
  for(const texto of ['okey acepto','si, las acepto','ok, acepto','las acepto','acepto','si, acepto entrega','acepto las fechas','dale'])
    assert.ok(esAceptacionEntrega(texto)||esConfirmacionCorta(texto),texto);
  for(const texto of ['no acepto','no las acepto','no, mejor otra fecha','rechazo la entrega'])
    assert.equal(esAceptacionEntrega(texto),false,texto);
});
test('Elegir el crédito con otras palabras se entiende como pago a crédito',()=>{
  assert.equal(turno('con mi credito estaria bien poder pagar','ELEGIR_PAGO').pago,'CREDITO');
  assert.equal(turno('prefiero pagar con credito','ELEGIR_PAGO').pago,'CREDITO');
  assert.notEqual(turno('con credito no, mejor al contado','ELEGIR_PAGO').pago,'CREDITO');
  assert.notEqual(turno('¿cuánto crédito tengo?','ELEGIR_PAGO').pago,'CREDITO');
});
