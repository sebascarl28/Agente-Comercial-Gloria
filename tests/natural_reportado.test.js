import test from 'node:test';
import assert from 'node:assert/strict';
import {avanzarSeleccion,extraerProductos} from '../lib/seleccion-productos.js';
import {interpretarPedidoNuevo} from '../lib/interpretacion-pedido.js';
import {leerTurno,esPagoCredito} from '../lib/dialogo.js';
import {fechaEscrita} from '../lib/ai.js';
import {preguntaFechaDisponible,responderFechaDisponible} from '../lib/fechas-conversacion.js';
import {ejecutarEnEscenarioPC3} from '../lib/escenario.js';
const pares=items=>items.map(({id,cantidad})=>({id,cantidad}));

test('La frase real asigna 20 frescas y 30 evaporadas, sin depender de Groq',()=>{
 const estado={};avanzarSeleccion('quiero varios productos',estado);avanzarSeleccion('quiero fresca y evaporada',estado);
 const r=avanzarSeleccion('quiero 20 para frescas y para evaporada quiero 30',estado);
 assert.deepEqual(pares(r.operaciones),[{id:'PRD-003',cantidad:20},{id:'PRD-002',cantidad:30}]);
 assert.deepEqual(pares(extraerProductos('20 para frescas y para evaporada quiero 30')),[{id:'PRD-003',cantidad:20},{id:'PRD-002',cantidad:30}]);
});
test('No se añade una tercera leche ante una corrección ambigua y no se descartan líneas',()=>{
 const estado={};avanzarSeleccion('varios productos',estado);avanzarSeleccion('fresca y evaporada',estado);
 const r=avanzarSeleccion('fresca y entera',estado);
 assert.match(r.mensaje,/reemplazar.*añadir/);assert.equal(estado.seleccion_productos.items.length,2);
 const ia={motor:'groq',quiere_cambiar_productos:true,lineas_sugeridas:[{id:'PRD-003',cantidad:20},{id:'PRD-002',cantidad:50}]};
 assert.equal(interpretarPedidoNuevo('20 y 50 respectivamente',estado,null,ia),null);
 const a=avanzarSeleccion('Reemplazar selección',estado);assert.match(a.mensaje,/fresca.*entera/);
 const b=avanzarSeleccion('20 y 50 respectivamente',estado);
 assert.deepEqual(pares(b.operaciones),[{id:'PRD-003',cantidad:20},{id:'PRD-001',cantidad:50}]);
});
test('Respectivamente requiere una cantidad por cada producto seleccionado',()=>{
 const estado={seleccion_productos:{items:[{id:'PRD-003',cantidad:null},{id:'PRD-002',cantidad:null},{id:'PRD-001',cantidad:null}]}};
 const r=avanzarSeleccion('20 y 50 respectivamente',estado);
 assert.equal(r.operaciones,undefined);assert.match(r.mensaje,/cantidad para cada una/);
});
test('Groq puede proponer números escritos en palabras sin cambiar productos ni crear cotización',()=>{
 const estado={};avanzarSeleccion('varios productos',estado);avanzarSeleccion('fresca y evaporada',estado);
 const ia={motor:'groq',quiere_cambiar_productos:true,lineas_sugeridas:[{id:'PRD-003',cantidad:20},{id:'PRD-002',cantidad:30}]};
 assert.equal(interpretarPedidoNuevo('veinte y treinta',estado,null,ia),null);
 const r=avanzarSeleccion('veinte y treinta',estado,null,ia);
 assert.equal(r.operaciones,undefined);assert.match(r.mensaje,/20 cajas.*30 cajas/);assert.equal(estado.esperando,'CONFIRMAR_PRODUCTOS_INTERPRETADOS');
});
test('Este mes se interpreta como el mes actual sin inventar un mes posterior',()=>{
 assert.equal(fechaEscrita('para el 17 de este mes','2026-11-13'),'2026-11-17');
 assert.equal(fechaEscrita('el 2 de este mes','2026-11-13'),'2026-11-02');
 assert.equal(fechaEscrita('el 31 de este mes','2026-11-13'),null);
 assert.equal(fechaEscrita('el 31 de este mes','2026-12-13'),'2026-12-31');
});
test('Con mi crédito aprobado selecciona pago solo en el contexto apropiado',()=>{
 const estado={esperando:'ELEGIR_PAGO'};
 assert.equal(leerTurno('Con mi crédito aprobado',{estado}).accion,'PAGO');
 assert.equal(leerTurno('Con mi crédito aprobado',{estado}).pago,'CREDITO');
 assert.equal(esPagoCredito('¿puedo pagar con mi crédito aprobado?',true),false);
 assert.equal(leerTurno('¿ya aprobaron mi crédito?',{estado}).accion,'CONSULTAR');
});
test('Cuándo está disponible informa fecha referencial sin crear entrega',async()=>{
 const q={items:[{cantidad:20,disponibilidad:{disponibles:90,planes:[]}},{cantidad:50,disponibilidad:{disponibles:300,planes:[]}}],entregas:[]};
 const estado={hoy:'2026-11-13'};assert.equal(preguntaFechaDisponible('¿para cuándo está disponible?'),true);
 await ejecutarEnEscenarioPC3(true,async()=>{const m=responderFechaDisponible(q,estado);assert.match(m,/16\/11\/2026/);assert.match(m,/sujeta a log[ií]stica/i);assert.deepEqual(q.entregas,[]);});
});
test('Preguntar por la fecha de un descuento no se confunde con disponibilidad',()=>{
 assert.equal(preguntaFechaDisponible('¿para cuándo está disponible el descuento?'),false);
 assert.equal(preguntaFechaDisponible('¿cuándo vence la leche?'),false);
});
test('Una pregunta sobre pago no elige contado ni crédito sin una elección',()=>{
 const estado={esperando:'ELEGIR_PAGO'};
 const r=leerTurno('¿puedo pagar con mi crédito aprobado?',{estado,interpretacion:{accion:'pago',modalidad:'CREDITO'}});
 assert.equal(r.pago,null);
 const c=leerTurno('¿puedo pagar al contado?',{estado,interpretacion:{accion:'pago',modalidad:'CONTADO'}});
 assert.equal(c.pago,null);
});
test('Las fechas imposibles no se aceptan como fechas válidas',async()=>{
 const {fechaValida}=await import('../lib/rules.js');
 assert.equal(fechaValida('2026-02-31'),false);
 assert.equal(fechaValida('2026-02-29'),false);
 assert.equal(fechaValida('2024-02-29'),true);
});
test('Cancelar el cambio de selección mantiene los productos anteriores',()=>{
 const estado={};avanzarSeleccion('varios productos',estado);avanzarSeleccion('fresca y evaporada',estado);
 avanzarSeleccion('fresca y entera',estado);
 const r=avanzarSeleccion('Cancelar',estado);
 assert.match(r.mensaje,/Mantengo.*fresca.*evaporada/);
 assert.deepEqual(estado.seleccion_productos.items.map(x=>x.id),['PRD-003','PRD-002']);
});
