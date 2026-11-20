import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {recuperarContexto,leerTurno} from '../lib/dialogo.js';

const cliente=texto=>({rol:'cliente',texto});
const agente=(texto,esperando)=>({rol:'agente',texto,estado_chat:{esperando}});

test('Si el estado se perdió, recupera la leche y la cantidad que el cliente ya dijo',()=>{
  const historial=[cliente('hola'),agente('Hola, ¿qué necesitas?'),cliente('evaporada'),agente('¡Claro! ¿Cuántas cajas?'),cliente('150'),agente('¡Perfecto! ¿Revisamos precio o entrega?'),cliente('precio'),agente('Precios...')];
  const estado=recuperarContexto(historial,{},null);
  assert.equal(estado.producto,'PRD-002');assert.equal(estado.cantidad_pendiente,150);
});
test('No mezcla compras: se detiene en un pedido ya registrado',()=>{
  const historial=[cliente('quiero 300 de fresca'),agente('Pedido registrado.','PEDIDO_CONFIRMADO'),cliente('hola otra vez')];
  const estado=recuperarContexto(historial,{},null);
  assert.equal(estado.producto,undefined);assert.equal(estado.cantidad_pendiente,undefined);
});
test('Con una cotización abierta no se toca el estado',()=>{
  const estado=recuperarContexto([cliente('quiero 10 de fresca')],{},{id_cotizacion:'x'});
  assert.equal(estado.producto,undefined);
});
test('Con la leche ya elegida, un número suelto es la cantidad aunque no haya pregunta pendiente',()=>{
  const turno=leerTurno('150',{estado:{producto:'PRD-002',hoy:'2026-11-19'},cotizacion:null,interpretacion:{}});
  assert.equal(turno.accion,'CANTIDAD');assert.equal(turno.cantidad,150);
  const sinLeche=leerTurno('150',{estado:{hoy:'2026-11-19'},cotizacion:null,interpretacion:{}});
  assert.notEqual(sinLeche.accion,'CANTIDAD');
});
test('Al preguntar por la entrega con leche y cantidad ya dichas, registra y responde la fecha en vez de volver a preguntar',()=>{
  const chat=readFileSync(new URL('../api/chat.js',import.meta.url),'utf8');
  assert.match(chat,/recuperarContexto\(/);
  assert.match(chat,/if\(!q&&estado\.producto&&estado\.cantidad_pendiente\)/);
});
