import test from 'node:test';
import assert from 'node:assert/strict';
import {avanzarSeleccion,cantidadDeProductos} from '../lib/seleccion-productos.js';
import {interpretarPedidoNuevo} from '../lib/interpretacion-pedido.js';
import {cantidadExplicita} from '../lib/dialogo.js';
import {intencionVerificableSinLLM} from '../lib/ai.js';
import {responderFechaDisponible} from '../lib/fechas-conversacion.js';

test('Tres lecehes no crea seis cajas, aunque la IA sugiera cantidades',()=>{
 const estado={seleccion_productos:{items:[],total:null}};
 const texto='quiero 3 lecehes evaporada y fresca';
 const ia={motor:'groq',quiere_cambiar_productos:true,lineas_sugeridas:[{id:'PRD-002',cantidad:3},{id:'PRD-003',cantidad:3}]};
 assert.equal(cantidadDeProductos(texto),true);assert.equal(cantidadExplicita(texto),null);assert.equal(intencionVerificableSinLLM(texto),true);
 assert.equal(interpretarPedidoNuevo(texto,estado,null,ia),null);
 const r=avanzarSeleccion(texto,estado,null,ia);assert.equal(r.operaciones,undefined);assert.match(r.mensaje,/tipos de leche o cajas/);
 assert.deepEqual(estado.seleccion_productos.items.map(x=>x.cantidad),[null,null]);
 const c=avanzarSeleccion('no, quiero 10 cajas de evaporada y 20 de fressca',estado,null,{});
 assert.match(c.mensaje,/10 cajas de leche evaporada.*20 cajas de leche fresca/);assert.equal(c.operaciones,undefined);
 assert.deepEqual(interpretarPedidoNuevo('Sí',estado,null,{}).operaciones,[{id:'PRD-002',cantidad:10},{id:'PRD-003',cantidad:20}]);
});
test('Se corrige directamente una propuesta pendiente y se confirma antes de crear',()=>{
 const estado={propuesta_productos:[{id:'PRD-002',cantidad:3},{id:'PRD-003',cantidad:3}]};
 const r=interpretarPedidoNuevo('no, quiero 10 cajas de evaporada y 20 de fressca',estado,null,{});
 assert.match(r.mensaje,/10 cajas de leche evaporada.*20 cajas de leche fresca/);assert.equal(r.operaciones,undefined);
 assert.deepEqual(interpretarPedidoNuevo('sí correcto',estado,null,{}).operaciones,[{id:'PRD-002',cantidad:10},{id:'PRD-003',cantidad:20}]);
});
test('La referencia solo menciona producción pendiente cuando realmente falta stock',()=>{
 const estado={hoy:'2026-11-13'};
 let q={version:1,items:[{cantidad:10,disponibilidad:{disponibles:20,planes:[]}}]};
 let m=responderFechaDisponible(q,estado);assert.doesNotMatch(m,/producción/i);assert.match(m,/confirmarse con despacho/);
 q={version:1,items:[{cantidad:20,disponibilidad:{disponibles:10,planes:[{cajas:10,fecha_disponibilidad:'2026-11-17'}]}}]};
 m=responderFechaDisponible(q,estado);assert.match(m,/producción.*cuando se liberen/i);assert.match(m,/tentativa/i);
});
