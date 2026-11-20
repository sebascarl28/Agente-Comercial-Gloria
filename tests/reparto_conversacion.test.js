import test from 'node:test';
import assert from 'node:assert/strict';
import {fechaEscrita} from '../lib/ai.js';
import {repartoPorProducto,fechasParcialesPorProducto,pideReparto} from '../lib/entregas-conversacion.js';
import {interpretarCambio} from '../lib/cambios-conversacion.js';
import {confirmacionFlexible} from '../lib/flexibilidad.js';
import {leerTurno} from '../lib/dialogo.js';
import {revisarTrasCambio} from '../lib/revisar-cambio.js';

const q={estado:'EN_NEGOCIACION',version:8,items:[{id_producto:'PRD-003',cantidad:30},{id_producto:'PRD-001',cantidad:20}]};
test('entregas por producto no mezclan fechas ni cambian cantidades',()=>{
 const t='los prefiero para mañana sabado, quiero recibir separado quiero mañana la leche fresa y el siguiente sabado la leche UHT';
 assert.equal(pideReparto(t),true);
 assert.deepEqual(repartoPorProducto(t,q,'2026-11-20'),[
   {id_producto:'PRD-003',cajas:30,fecha:'2026-11-21'},
   {id_producto:'PRD-001',cajas:20,fecha:'2026-11-28'}]);
 assert.equal(repartoPorProducto('fresca mañana y evaporada el siguiente sábado',q,'2026-11-20'),null);
});
test('una línea sin nombre se asigna solo por cantidad inequívoca',()=>{
 const dos={items:[{id_producto:'PRD-003',cantidad:10},{id_producto:'PRD-002',cantidad:20}]};
 assert.deepEqual(repartoPorProducto('dime 10 cajas de leche para mañana y las 20 cajas de evaporada para el lunes',dos,'2026-11-20'),[
   {id_producto:'PRD-003',cajas:10,fecha:'2026-11-21'},
   {id_producto:'PRD-002',cajas:20,fecha:'2026-11-23'}]);
 assert.equal(repartoPorProducto('dime 30 cajas de leche para mañana y las 20 de evaporada para el lunes',dos,'2026-11-20'),null);
});
test('«me la den mañana» es entrega, no cambio de productos',()=>{
 const dos={items:[{id_producto:'PRD-003',cantidad:20},{id_producto:'PRD-002',cantidad:20}]};
 const t='quiero que la leche fresca gloria me la den mañana y la evaporada me la den la siguiente semana';
 assert.equal(pideReparto(t),true);
 assert.equal(repartoPorProducto(t,dos,'2026-11-20'),null);
 assert.deepEqual(fechasParcialesPorProducto(t,dos,'2026-11-20'),[{id_producto:'PRD-003',fecha:'2026-11-21'}]);
});
test('fecha corregida y afirmación contextual',()=>{
 assert.equal(fechaEscrita('osea para mñana mejor','2026-11-20'),'2026-11-21');
 assert.equal(leerTurno('osea para mñana mejor',{estado:{hoy:'2026-11-20'},cotizacion:q}).fecha,'2026-11-21');
 assert.deepEqual(confirmacionFlexible('diría que sí es correcto',{}, {esperando:'CONFIRMAR_PRODUCTOS_INTERPRETADOS'}),{valor:'SI',via:'reglas'});
 assert.equal(confirmacionFlexible('sí, pero cambia la fecha',{}, {esperando:'ACEPTAR_ENTREGA'}),null);
});
test('cambio compuesto conserva cantidades finales para validación',()=>{
 const t='puedo cambiar de 30 cajas de leche fresca a 35 y para leche gloria entera de las 20 quiero unas 15, y finalmente pedir un descuento del 5%';
 assert.deepEqual(interpretarCambio(t,{},q).operaciones,[{id:'PRD-003',cantidad:35},{id:'PRD-001',cantidad:15}]);
 assert.equal(leerTurno(t,{estado:{hoy:'2026-11-20'},cotizacion:q}).descuentoPct,5);
});
test('cambio de cajas revalida cada fecha separada con las nuevas cajas',async()=>{
 const antes={descuento_pct:0,entregas:[{id_producto:'PRD-003',cajas:30,fecha:'2026-11-21'},{id_producto:'PRD-001',cajas:20,fecha:'2026-11-28'}]};
 const despues={...q,id_cotizacion:'COT-1',items:[{id_producto:'PRD-003',cantidad:35},{id_producto:'PRD-001',cantidad:15}]};
 let solicitado;
 const r=await revisarTrasCambio(antes,despues,{},async(id,datos)=>{solicitado=datos;return {cotizacion:despues,mensaje:'Propuesta validada'};});
 assert.equal(solicitado.modo,'PERSONALIZADA');
 assert.deepEqual(solicitado.partes,[{id_producto:'PRD-003',cajas:35,fecha:'2026-11-21'},{id_producto:'PRD-001',cajas:15,fecha:'2026-11-28'}]);
 assert.match(r.mensaje,/fecha por leche/);
});
