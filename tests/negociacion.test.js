import test from 'node:test';
import assert from 'node:assert/strict';
import {listaPendientes,resumenHabilitado,siguientePaso,estadoComercial} from '../lib/negociacion.js';
import {respaldo,temaConsulta,fechaEscrita} from '../lib/ai.js';
import {readFileSync} from 'node:fs';
const q={id_cotizacion:'demo-1',version:3,estado:'EN_NEGOCIACION',producto_nombre:'Leche UHT Gloria Entera 1 L',cantidad:300,descuento_pct:0,total:21240,forma_pago:'SIN_DEFINIR',direccion:'Av. Ejemplo 2450',distrito:'Ate',direccion_confirmada:false,entregas:[],entrega_aceptada:false,aprobaciones:[],linea_credito:30000,deuda_vigente:0};
test('No permite mostrar resumen si faltan entregas, pago o dirección',()=>{
  assert.equal(resumenHabilitado(q),false);
  assert.match(siguientePaso(q),/fecha deseas recibir/i);
  assert.ok(listaPendientes(q).length>=3);
});
test('Después de aceptar entrega, pago y dirección ya habilita resumen final',()=>{
  const listo={...q,entregas:[{cajas:250,fecha:'2026-11-14'},{cajas:50,fecha:'2026-11-19'}],entrega_aceptada:true,forma_pago:'CREDITO',direccion_confirmada:true};
  assert.equal(resumenHabilitado(listo),true);
  assert.match(siguientePaso(listo),/resumen final/i);
  assert.equal(resumenHabilitado({...listo,aprobaciones:[{estado:'OFERTADO',ofrecido_pct:8}]}),false);
  assert.equal(resumenHabilitado({...listo,deuda_vigente:30000}),false);
});
test('Consulta descuento de Jefatura con estado real',()=>{
  const pendiente={...q,aprobaciones:[{estado:'PENDIENTE_JEFATURA',solicitado_pct:8}]};
  assert.match(estadoComercial({q:pendiente,contexto:{},tema:'descuento'}),/pendiente de Jefatura/i);
  const ofertado={...q,aprobaciones:[{estado:'OFERTADO',ofrecido_pct:6,solicitado_pct:8}]};
  assert.match(estadoComercial({q:ofertado,contexto:{},tema:'descuento'}),/6%/);
  assert.match(estadoComercial({q:ofertado,contexto:{},tema:'descuento'}),/falta que t[uú] lo aceptes/i);
  const aceptado={...q,descuento_pct:6,aprobaciones:[{estado:'ACEPTADA_CLIENTE',ofrecido_pct:6}]};
  assert.match(estadoComercial({q:aceptado,contexto:{},tema:'descuento'}),/Jefatura autorizó 6%/);
});
test('Distingue consulta de estado de nueva petición comercial',()=>{
  assert.equal(temaConsulta('¿Ya aprobaron mi descuento en jefatura?'),'descuento');
  assert.equal(respaldo('¿Ya aprobaron mi descuento en jefatura?').accion,'consultar');
  assert.equal(respaldo('Quiero 8% de descuento').accion,'descuento');
  assert.equal(respaldo('Necesito 300 cajas UHT').accion,'cotizar');
  assert.equal(respaldo('Para el 19 de noviembre').accion,'entrega');
});
test('Interpreta fechas de cliente sin inventar despacho',()=>{
  assert.equal(fechaEscrita('el 20 de noviembre','2026-11-13'),'2026-11-20');
  assert.equal(fechaEscrita('19/11/2026','2026-11-13'),'2026-11-19');
  assert.equal(fechaEscrita('mañana','2026-11-13'),'2026-11-14');
});
test('Conserva aislamiento por sesión y oculta resumen incompleto en frontend',()=>{
  const s=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
  const api=readFileSync(new URL('../api/chat.js',import.meta.url),'utf8');
  assert.match(s,/X-Demo-Session/);
  assert.match(s,/mostrarResumenFinal\(q\)\?summaryView\(q\)/);
  assert.match(api,/enSimulacion\(req,\(\)=>atender\(req,res\)\)/);
  assert.match(api,/case 'consultar'/);
});
