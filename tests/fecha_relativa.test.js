import test from 'node:test';
import assert from 'node:assert/strict';
import {leerTurno,periodoEntrega} from '../lib/dialogo.js';
import {atenderFechaRelativa,fechasProximaSemana} from '../lib/fechas-conversacion.js';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const q={estado:'BORRADOR',cantidad:150,items:[{id_producto:'PRD-001',cantidad:100},{id_producto:'PRD-003',cantidad:50}],entregas:[],entrega_aceptada:false};
const contexto=()=>({estado:{hoy:'2026-11-13',esperando:'ELEGIR_FECHA'},cotizacion:q,interpretacion:{accion:'conversar'}});
test('Reconoce distintas formas de pedir la siguiente semana con o sin Groq',()=>{
 for(const frase of ['Me gustaría recibir la leche la próxima semana','la siguiente semana','la semana que viene','semana entrante']){
  const d=leerTurno(frase,contexto());assert.equal(d.accion,'FECHA_RELATIVA',frase);assert.equal(d.periodo,'proxima_semana');assert.equal(d.fecha,null);
 }
 assert.equal(periodoEntrega('esta semana'),'esta_semana');
 assert.equal(leerTurno('la semana que viene el 17/11',contexto()).fecha,'2026-11-17');
});
test('Una semana sin día pide fecha sin modificar cantidades ni registrar entrega',()=>{
 const estado={hoy:'2026-11-13',esperando:'ELEGIR_FECHA',confirmacion_final:{id:1}};
 const snapshot=structuredClone(q);const d=leerTurno('la próxima semana',{estado,cotizacion:q});
 const m=atenderFechaRelativa(d,estado,q);
 assert.match(m,/próxima semana/);assert.match(m,/qu[eé] día/i);
 assert.equal(estado.esperando,'PEDIR_FECHA_EXACTA');assert.equal(estado.confirmacion_final,null);
 assert.deepEqual(estado.fechas_sugeridas,['2026-11-16','2026-11-18','2026-11-20']);assert.deepEqual(q,snapshot);
 const proximo=leerTurno('17/11',{estado,cotizacion:q,interpretacion:{accion:'conversar'}});
 assert.equal(proximo.accion,'FECHA');assert.equal(proximo.fecha,'2026-11-17');
});
test('Opciones de la semana calculan correctamente domingo y cambio de año',()=>{
 assert.deepEqual(fechasProximaSemana('2026-11-15'),['2026-11-16','2026-11-18','2026-11-20']);
 assert.deepEqual(fechasProximaSemana('2026-12-31'),['2027-01-04','2027-01-06','2027-01-08']);
 assert.deepEqual(fechasProximaSemana(''),[]);
});
test('Si menciona otra cantidad, pide aclaración y no cambia cotización',()=>{
 const estado={hoy:'2026-11-13'};const snapshot=structuredClone(q);
 const turno=leerTurno('quiero recibir 50 cajas la próxima semana',{estado,cotizacion:q});
 assert.equal(turno.accion,'FECHA_RELATIVA');assert.equal(turno.cantidad,50);
 assert.match(atenderFechaRelativa(turno,estado,q),/modificar la cantidad/);assert.deepEqual(q,snapshot);
});
test('Botones muestran fechas como preferencias y no hacen reservas',()=>{
 const src=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const fn=src.slice(src.indexOf('function sugerenciasDelMomento(q){'),src.indexOf('function panelCasoPC3()'));
 const estado={esperando:'PEDIR_FECHA_EXACTA',fechas_sugeridas:['2026-11-16','2026-11-18','2026-11-20']};
 const res=vm.runInNewContext(`(${fn})(q)`,{q,day:x=>x,app:{mensajes:[{rol:'agente',estado_chat:estado}]},mostrarResumenFinal:()=>false});
 assert.deepEqual(Array.from(res,x=>x[1]),['2026-11-16','2026-11-18','2026-11-20']);
});
test('Tras aclarar que solo cambia la fecha, conserva la semana y pregunta el día',async()=>{
 const {aclararFechaCantidad}=await import('../lib/fechas-conversacion.js');
 const estado={hoy:'2026-11-13'};const turno=leerTurno('quiero recibir 50 cajas la próxima semana',{estado,cotizacion:q});
 atenderFechaRelativa(turno,estado,q);
 const m=aclararFechaCantidad('Solo fecha',estado,q);
 assert.match(m,/próxima semana/);assert.equal(estado.esperando,'PEDIR_FECHA_EXACTA');
 assert.deepEqual(estado.fechas_sugeridas,['2026-11-16','2026-11-18','2026-11-20']);
});
