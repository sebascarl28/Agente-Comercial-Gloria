import test from 'node:test';
import assert from 'node:assert/strict';
import {explicarStockDeCotizacion} from '../lib/respuesta-stock.js';
import {readFileSync} from 'node:fs';
const q={
  estado:'BORRADOR',
  items:[
    {id_producto:'PRD-001',producto_nombre:'Leche UHT',cantidad:180,disponibilidad:{disponibles:180,planificadas:0,planes:[]}},
    {id_producto:'PRD-002',producto_nombre:'Leche evaporada',cantidad:60,disponibilidad:{disponibles:40,planificadas:20,planes:[{libres:20,fecha_disponibilidad:'2026-11-17'}]}},
    {id_producto:'PRD-003',producto_nombre:'Leche fresca',cantidad:120,disponibilidad:{disponibles:120,planificadas:0,planes:[]}}
  ],
  entregas:[
    {id_producto:'PRD-001',cajas:180,fecha:'2026-11-16'},
    {id_producto:'PRD-002',cajas:40,fecha:'2026-11-16'},
    {id_producto:'PRD-003',cajas:120,fecha:'2026-11-16'},
    {id_producto:'PRD-002',cajas:20,fecha:'2026-11-17'}
  ],entrega_aceptada:false
};
test('consulta stock durante una cotización PC3 sin reiniciarla',()=>{
  const antes=JSON.stringify(q);
  const mensaje=explicarStockDeCotizacion(q);
  assert.match(mensaje,/360 cajas/);
  assert.match(mensaje,/20 previstas en producci[oó]n/);
  assert.match(mensaje,/340 cajas para el 16\/11\/2026/);
  assert.match(mensaje,/20 cajas para el 17\/11\/2026/);
  assert.doesNotMatch(mensaje,/cu[aá]ntas cajas deseas cotizar/i);
  assert.equal(JSON.stringify(q),antes);
});
test('pregunta de una variedad conserva negociación de varias leches',()=>{
  const mensaje=explicarStockDeCotizacion(q,'PRD-002');
  assert.match(mensaje,/leche evaporada/);
  assert.doesNotMatch(mensaje,/• leche fresca:/);
  assert.match(mensaje,/20 cajas para el 17\/11\/2026/);
});
test('la rama de stock no cambia la etapa del pedido',()=>{
  const chat=readFileSync(new URL('../api/chat.js',import.meta.url),'utf8');
  assert.match(chat,/d\.accion==='STOCK' && q\.items\?\.length/);
  assert.match(chat,/explicarStockDeCotizacion\(q,productoDicho\)/);
});
