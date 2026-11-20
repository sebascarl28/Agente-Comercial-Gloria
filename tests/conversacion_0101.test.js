import test from 'node:test';
import assert from 'node:assert/strict';
import {interpretarPedidoNuevo} from '../lib/interpretacion-pedido.js';
import {leerTurno} from '../lib/dialogo.js';
import {respaldo} from '../lib/ai.js';
import {confirmacionFlexible} from '../lib/flexibilidad.js';

const pares=items=>items.map(({id,cantidad})=>[id,cantidad]);

test('La propuesta sin confirmar permite sumar a una sola leche y volver a corregir',()=>{
 const estado={};
 interpretarPedidoNuevo('quiero 10 cajas de leche evaporadaa y 30 de leche fresca',estado,null,{});
 assert.deepEqual(pares(estado.propuesta_productos),[['PRD-002',10],['PRD-003',30]]);
 const primero=interpretarPedidoNuevo('correcto, pero puedes aumentar 5 cajas mas a la leche evaporada por fa',estado,null,{});
 assert.equal(primero.operaciones,undefined);
 assert.deepEqual(pares(estado.propuesta_productos),[['PRD-002',15],['PRD-003',30]]);
 assert.match(primero.mensaje,/15 cajas.*30 cajas/);
 interpretarPedidoNuevo('Corregir',estado,null,{});
 assert.equal(estado.propuesta_productos,undefined);
 interpretarPedidoNuevo('osea 15 cajas de leche evaporadaa y 35 de leche fresca',estado,null,{});
 interpretarPedidoNuevo('aumentale 5 cajas a la leche evaporada',estado,null,{});
 assert.deepEqual(pares(estado.propuesta_productos),[['PRD-002',20],['PRD-003',35]]);
 assert.deepEqual(pares(interpretarPedidoNuevo('Sí',estado,null,{}).operaciones),[['PRD-002',20],['PRD-003',35]]);
});

test('Una petición vaga no inventa la variedad y «aumenta a» fija el total',()=>{
 const estado={propuesta_productos:[{id:'PRD-002',cantidad:10},{id:'PRD-003',cantidad:30}]};
 assert.match(interpretarPedidoNuevo('súmale 5 cajas',estado,null,{}).mensaje,/A cuál leche/i);
 assert.deepEqual(pares(estado.propuesta_productos),[['PRD-002',10],['PRD-003',30]]);
 interpretarPedidoNuevo('aumenta a 20 cajas de evaporada',estado,null,{});
 assert.deepEqual(pares(estado.propuesta_productos),[['PRD-002',20],['PRD-003',30]]);
 interpretarPedidoNuevo('quiero sumar 5 cajas de evaporada y 10 cajas de fresca',estado,null,{});
 assert.deepEqual(pares(estado.propuesta_productos),[['PRD-002',25],['PRD-003',40]]);
 interpretarPedidoNuevo('correcto, pero quiero agregar 5 cajas de evaporada',estado,null,{});
 assert.deepEqual(pares(estado.propuesta_productos),[['PRD-002',30],['PRD-003',40]]);
});

test('Elegir crédito y decir porcentaje en palabras funciona sin proveedor de IA',()=>{
 const estado={esperando:'ELEGIR_PAGO',hoy:'2026-11-19'};
 const pago=leerTurno('diria que quiero pagar asi al credito que tengo',{estado});
 assert.equal(pago.accion,'PAGO');assert.equal(pago.pago,'CREDITO');
 assert.equal(leerTurno('con el credito que me dieron',{estado}).pago,'CREDITO');
 assert.equal(leerTurno('¿cuánto crédito tengo?',{estado}).pago,null);
 for(const frase of ['puedo pedir el 10 porciento?','quiero aprox un 10 porciento','quiero 10 por ciento','quiero 10%']){
  const turno=leerTurno(frase,{estado:{esperando:'DESCUENTO_OPCIONAL',hoy:'2026-11-19'}});
  assert.equal(turno.accion,'DESCUENTO',frase);assert.equal(turno.descuentoPct,10,frase);
  assert.equal(respaldo(frase).descuento_pct,10,frase);
 }
});

test('«Sí, pero…» nunca acepta silenciosamente una propuesta',()=>{
 assert.equal(confirmacionFlexible('sí, pero agrega más cajas',{}, {esperando:'CONFIRMAR_PRODUCTOS_INTERPRETADOS'}),null);
 assert.equal(confirmacionFlexible('correcto, pero quiero cambiar algo',{}, {esperando:'CONFIRMAR_PRODUCTOS_INTERPRETADOS'}),null);
});
