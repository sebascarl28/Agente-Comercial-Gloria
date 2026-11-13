import test from 'node:test';
import assert from 'node:assert/strict';
import {interpretarCambio} from '../lib/cambios-conversacion.js';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const q={estado:'BORRADOR',version:3,items:[{id_producto:'PRD-001',cantidad:100},{id_producto:'PRD-003',cantidad:100}]};
const pares=xs=>xs.map(({id,cantidad})=>({id,cantidad}));
test('Mantiene la propuesta ambigua y responde a quiero modificar de la captura',()=>{
 const estado={};const r=interpretarCambio('quiero pedir 50 cajas de lecehe entera y 60 de leche fresca',estado,q);
 assert.match(r.mensaje,/reemplazar.*sumar/);assert.equal(r.operaciones,undefined);
 const decision=interpretarCambio('quiero modificar',estado,q);
 assert.equal(decision.modo,'FIJAR');assert.equal(decision.version,3);
 assert.deepEqual(pares(decision.operaciones),[{id:'PRD-001',cantidad:50},{id:'PRD-003',cantidad:60}]);
});
test('Botón sumar registra una suma y cancelar no cambia las líneas',()=>{
 const estado={};interpretarCambio('quiero 50 de entera y 60 de fresca',estado,q);
 assert.equal(interpretarCambio('Quiero sumar',estado,q).modo,'AGREGAR');
 assert.match(interpretarCambio('Cancelar',estado,q).mensaje,/mantengo/i);
 assert.equal(estado.cambio_multi,undefined);
});
test('No aplica una propuesta anterior a una versión diferente',()=>{
 const estado={};interpretarCambio('quiero 50 de entera y 60 de fresca',estado,q);
 const r=interpretarCambio('quiero modificar',estado,{...q,version:4});
 assert.equal(r.operaciones,undefined);assert.match(r.mensaje,/cambió/);
});
test('La modificación explícita de las dos líneas se interpreta junta',()=>{
 const r=interpretarCambio('cambiar a 50 cajas de entera y 60 de fresca',{},q);
 assert.equal(r.modo,'FIJAR');assert.deepEqual(pares(r.operaciones),[{id:'PRD-001',cantidad:50},{id:'PRD-003',cantidad:60}]);
});
test('Consulta de stock y cotización confirmada no alteran la propuesta',()=>{
 const estado={};interpretarCambio('quiero 50 de entera y 60 de fresca',estado,q);
 assert.equal(interpretarCambio('¿qué stock hay?',estado,q),null);
 assert.ok(estado.cambio_multi);
 assert.equal(interpretarCambio('quiero 50 de entera y 60 de fresca',{}, {...q,estado:'CONFIRMADA'}),null);
});
test('Botones proponen lo que el asesor está preguntando',()=>{
 const src=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const fn=src.slice(src.indexOf('function sugerenciasDelMomento(q){'),src.indexOf('function panelCasoPC3()'));
 const suggestions=estado=>vm.runInNewContext(`(${fn})(q)`,{q,app:{mensajes:[{rol:'agente',estado_chat:estado}]},mostrarResumenFinal:()=>false});
 const choices=suggestions({esperando:'ELEGIR_ACCION_MULTIPRODUCTO'});
 assert.deepEqual(Array.from(choices,x=>x[1]),['Quiero modificar','Quiero sumar','Cancelar']);
 const quantities=suggestions({esperando:'CANTIDAD_SELECCION',seleccion_productos:{items:[{cantidad:null},{cantidad:null}]}});
 assert.equal(quantities[1][1],'100 cajas de cada una');
});
test('La interpretación de IA se muestra como propuesta y exige una decisión del cliente',()=>{
 const estado={};const ia={motor:'groq',quiere_cambiar_productos:true,lineas_sugeridas:[{id:'PRD-001',cantidad:50},{id:'PRD-003',cantidad:60}]};
 const r=interpretarCambio('quisiera cincuenta de entera y sesenta de fresca',estado,q,ia);
 assert.equal(r.operaciones,undefined);assert.match(r.mensaje,/Entendí 50 cajas.*60 cajas/);
 assert.equal(estado.esperando,'ELEGIR_ACCION_MULTIPRODUCTO');
 assert.equal(interpretarCambio('Quiero modificar',estado,q,ia).modo,'FIJAR');
});
test('Una sugerencia IA inválida o una pregunta no modifica productos',()=>{
 const ia={motor:'groq',quiere_cambiar_productos:true,lineas_sugeridas:[{id:'PRD-001',cantidad:50},{id:'PRD-003',cantidad:60}]};
 assert.equal(interpretarCambio('¿y si fueran cincuenta y sesenta?',{},q,ia),null);
 assert.equal(interpretarCambio('No quiero más cajas',{},q,ia),null);
 assert.equal(interpretarCambio('otra solicitud',{},q,{...ia,lineas_sugeridas:[{id:'PRD-001',cantidad:-1},{id:'PRD-003',cantidad:60}]}),null);
});
test('Cambiar una cantidad entre tres productos conserva las otras líneas',()=>{
 const cot={estado:'BORRADOR',version:8,items:[{id_producto:'PRD-001',cantidad:50},{id_producto:'PRD-002',cantidad:20},{id_producto:'PRD-003',cantidad:10}]};
 for(const [frase,n] of [['ya no quiero pedir 20 cajas de leche evaporada quiero 18 se puede modificar?',18],['aumenta evaporada a 25 cajas',25],['disminuye leche evaporada a 18',18]]){
 const r=interpretarCambio(frase,{},cot);assert.deepEqual(r.operaciones,[{id:'PRD-002',cantidad:n}]);assert.equal(r.modo,'FIJAR');assert.equal(r.version,8);
 }
 assert.equal(interpretarCambio('cambia evaporada a 18',{}, {...cot,estado:'CONFIRMADA'}),null);
 assert.match(interpretarCambio('cambia a 25 cajas',{},cot).mensaje,/qué leche/);
});
