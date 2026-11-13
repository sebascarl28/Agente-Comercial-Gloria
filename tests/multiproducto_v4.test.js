import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {calcularLineas,validarEntregasMulti} from '../lib/multiproducto.js';
import {detectarProducto,pideAgregarProducto,pideQuitarProducto,leerTurno,preguntaFechaAmbigua,preguntaVencimiento} from '../lib/dialogo.js';
const fres={id_producto:'PRD-003',producto_nombre:'Leche fresca',cantidad:30,precio_unitario:100,costo:60,margen_minimo:25};
const uht={id_producto:'PRD-001',producto_nombre:'Leche UHT',cantidad:10,precio_unitario:80,costo:50,margen_minimo:15};
const datos=[fres,uht];
test('Reconoce UTHD y propone corrección de manera explícita',()=>{
  assert.deepEqual(detectarProducto('quiero leche UTHD'),{id:'PRD-001',correccion:true});
  assert.deepEqual(detectarProducto('leche UHT'),{id:'PRD-001',correccion:false});
  assert.equal(detectarProducto('leche Gloria'),null);
  assert.equal(leerTurno('leche UTHD',{estado:{hoy:'2026-11-13'},interpretacion:{accion:'conversar'}}).nombreCorregido,true);
});
test('Pide agregar y quitar sin confundir con reemplazar',()=>{
  assert.equal(pideAgregarProducto('¿Puedo añadir otro producto?'),true);
  assert.equal(pideAgregarProducto('quiero cambiar por otra leche'),false);
  assert.equal(pideQuitarProducto('Quita leche fresca'),true);
});
test('Fecha ambigua pide aclaración y vencimiento no cambia pedido',()=>{
  assert.equal(preguntaFechaAmbigua('¿Hasta cuándo tienen?'),true);
  assert.equal(preguntaVencimiento('¿Cuándo vence la leche?'),true);
  assert.equal(leerTurno('¿Hasta cuándo tienen?',{estado:{hoy:'2026-11-13'},interpretacion:{accion:'entrega'}}).accion,'ACLARAR_FECHA');
});
test('Cotización de 30 frescas y 10 UHT suma línea, cajas, IGV y total',()=>{
  const x=calcularLineas(datos,0);
  assert.equal(x.cantidad,40);assert.equal(x.lineas.length,2);
  assert.equal(x.subtotal,3800);assert.equal(x.igv,684);assert.equal(x.total,4484);
});
test('Descuento multiproducto se recalcula correctamente y valida margen por leche',()=>{
  const x=calcularLineas(datos,5);
  assert.equal(x.subtotal,3610);assert.equal(x.total,4259.8);
  assert.throws(()=>calcularLineas(datos,25),/margen mínimo/);
});
test('Impide productos repetidos y cantidades inválidas en un pedido',()=>{
  assert.throws(()=>calcularLineas([fres,{...fres}],0),/Producto repetido/);
  assert.throws(()=>calcularLineas([{...fres,cantidad:-2}],0),/Línea de producto inválida/);
});
test('Las entregas suman cantidad exacta de CADA producto, no solo total agregado',()=>{
  const correctas=[{id_producto:'PRD-003',cajas:30},{id_producto:'PRD-001',cajas:10}];
  assert.equal(validarEntregasMulti(datos,correctas),true);
  assert.throws(()=>validarEntregasMulti(datos,[{id_producto:'PRD-003',cajas:20},{id_producto:'PRD-001',cajas:20}]),/no cubren/);
  assert.throws(()=>validarEntregasMulti(datos,[{id_producto:'PRD-003',cajas:40}]),/no cubren/);
});
test('Migración retira unicidad de una sola línea sin borrar datos',()=>{
  const sql=readFileSync(new URL('../sql/04_cotizaciones_multiproducto.sql',import.meta.url),'utf8');
  assert.match(sql,/DROP CONSTRAINT IF EXISTS cotizacion_detalle_id_cotizacion_key/);
  assert.match(sql,/CREATE UNIQUE INDEX IF NOT EXISTS uq_cotizacion_detalle_producto/);
  assert.match(sql,/ALTER TABLE public.entregas ADD COLUMN IF NOT EXISTS id_producto/);
  assert.doesNotMatch(sql,/\bTRUNCATE\b|\bDELETE FROM\b|\bDROP TABLE\b/i);
});
test('No se aceptan despachos cruzados entre productos en backend y sus reservas',()=>{
  const src=readFileSync(new URL('../lib/service.js',import.meta.url),'utf8');
  assert.match(src,/validarEntregasMulti\(x.lineas,partes\)/);
  assert.match(src,/v\.id_producto===parte\.id_producto/);
  assert.match(src,/INSERT INTO entregas\(id_pedido,id_producto/);
});
test('El chat conserva líneas y permite corregir nombres, dinámica de preguntas y confirmación',()=>{
  const src=readFileSync(new URL('../api/chat.js',import.meta.url),'utf8');
  assert.match(src,/cambiarLinea\(/);
  assert.match(src,/estado.esperando='CONFIRMAR_TIPO_LECHE'/);
  assert.match(src,/d.accion==='ACLARAR_FECHA'/);
});
test('Los botones del chat dependen del estado de la conversación y envían texto',()=>{
  const ui=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
  assert.match(ui,/function sugerenciasDelMomento\(q\)/);
  assert.match(ui,/data-chat-suggest/);
  assert.match(ui,/chatSuggest/);
});
