import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {leerTurno,esConsultaStock,esPreguntaFaltanteEntrega} from '../lib/dialogo.js';
import {respaldo,intencionVerificableSinLLM} from '../lib/ai.js';
import {explicarStockDeCotizacion} from '../lib/respuesta-stock.js';

const cotizacion={
  id_producto:'PRD-001',estado:'BORRADOR',cantidad:360,entrega_aceptada:false,
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
  ]
};
const estado={hoy:'2026-11-13',esperando:'ACEPTAR_ENTREGA',producto:'PRD-002'};
const turno=mensaje=>leerTurno(mensaje,{
  estado,cotizacion,interpretacion:respaldo(mensaje,{fecha_hoy:estado.hoy})
});

test('pregunta por stock total: no crear 360 cajas de evaporada',()=>{
  const pregunta='¿Cuánto stock disponible tenemos para este pedido de 360 cajas?';
  assert.equal(esConsultaStock(pregunta),true);
  assert.equal(intencionVerificableSinLLM(pregunta),true);
  const antes=JSON.stringify(cotizacion);
  const respuesta=explicarStockDeCotizacion(cotizacion);
  assert.match(respuesta,/cotización actual es de 360 cajas/);
  assert.match(respuesta,/leche evaporada: pediste 60; hay 40/);
  assert.match(respuesta,/340 cajas para el 16\/11\/2026 y 20 cajas para el 17\/11\/2026/);
  assert.equal(JSON.stringify(cotizacion),antes);
});

test('solicitud 360 cajas para el 16 es fecha de entrega, no cantidad nueva',()=>{
  const pregunta='Quiero recibir las 360 cajas el 16 de noviembre de 2026.';
  const d=turno(pregunta);
  assert.equal(d.accion,'FECHA');
  assert.equal(d.fecha,'2026-11-16');
  assert.equal(intencionVerificableSinLLM(pregunta),true);
});

test('por qué no entregan todo el 16: explicación aun sin Groq',()=>{
  const pregunta='¿Por qué no pueden entregar todas las cajas el día 16?';
  assert.equal(esPreguntaFaltanteEntrega(pregunta),true);
  assert.equal(intencionVerificableSinLLM(pregunta),true);
  assert.equal(esPreguntaFaltanteEntrega('Quiero 20 cajas adicionales'),false);
});

test('servidor prioriza contexto PC3 antes que interpretar cantidad adicional',()=>{
  const src=readFileSync(new URL('../api/chat.js',import.meta.url),'utf8');
  const stock=src.indexOf('esConsultaStock(texto) && !esTodoStock(texto)');
  const cantidad=src.indexOf("d.accion==='CANTIDAD' && d.cantidad");
  assert.ok(stock>0 && stock<cantidad);
  assert.ok(src.indexOf('esCotizacionOficialPC3(q) && esPreguntaFaltanteEntrega(texto)')>stock);
  assert.ok(src.includes("d.fecha===PRIMERA_ENTREGA_PC3"));
  assert.ok(src.includes('mensajeFaltantePC3()'));
});

test('UI informa al usuario cuando usa reglas ERP/CRM sin consumir cuota',()=>{
  const ui=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
  assert.match(ui,/reglas_contextuales/);
  assert.match(ui,/sin consumir cuota Groq/);
});
