import test from 'node:test';
import assert from 'node:assert/strict';
import {interpretarCambio} from '../lib/cambios-conversacion.js';
import {revisarTrasCambio} from '../lib/revisar-cambio.js';
import {esPagoCredito} from '../lib/dialogo.js';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const q={id_cotizacion:'Q1',estado:'BORRADOR',version:3,descuento_pct:7,items:[{id_producto:'PRD-002',cantidad:100},{id_producto:'PRD-003',cantidad:50}],entregas:[{id_producto:'PRD-002',cajas:100,fecha:'2026-11-14'},{id_producto:'PRD-003',cajas:50,fecha:'2026-11-14'}]};
test('Variedad nueva durante modificación exige elegir alcance, sin cambiar el pedido',()=>{
 const estado={};const original=structuredClone(q);
 const r=interpretarCambio('quiero cambiar de 30 cajas de leche entera y 20 de fresca',estado,q);
 assert.equal(r.operaciones,undefined);assert.equal(estado.esperando,'ACLARAR_CAMBIO_PRODUCTOS');assert.deepEqual(q,original);
 const reemplazo=interpretarCambio('Reemplazar productos',estado,q);
 assert.equal(reemplazo.modo,'REEMPLAZAR');assert.deepEqual(reemplazo.operaciones.map(x=>x.id),['PRD-001','PRD-003']);
 assert.equal(interpretarCambio('Conservar los demas',estado,q).modo,'FIJAR');
 assert.equal(interpretarCambio('Cancelar',estado,q).operaciones,undefined);assert.equal(estado.cambio_seleccion,undefined);
 assert.equal(interpretarCambio('cambia entera a 30 cajas',{},q).operaciones,undefined);
});
test('Modificar cantidades existentes no agrega ni elimina otras leches',()=>{
 const r=interpretarCambio('cambia evaporada a 18 cajas',{},q);assert.deepEqual(r.operaciones,[{id:'PRD-002',cantidad:18}]);assert.equal(r.modo,'FIJAR');
});
test('Mantiene y revalida la fecha, exige aceptación y vuelve a consultar descuento',async()=>{
 const estado={descuento_consultado:true,confirmacion_final:'anterior',cambio_multi:{}};
 const actual={...q,version:4,descuento_pct:0,entregas:[]};let llamadas=0;
 const r=await revisarTrasCambio(q,actual,estado,async(id,datos)=>{llamadas++;assert.equal(id,'Q1');assert.deepEqual(datos,{modo:'TODO_DESPUES',fecha:'2026-11-14'});return {mensaje:'Propuesta revisada. ¿Aceptas?',cotizacion:{...actual,entregas:q.entregas,entrega_aceptada:false}};});
 assert.equal(llamadas,1);assert.equal(r.cotizacion.entrega_aceptada,false);assert.equal(estado.esperando,'ACEPTAR_ENTREGA');assert.equal(estado.descuento_consultado,false);assert.equal(estado.confirmacion_final,null);assert.match(r.mensaje,/7%.*nueva evaluación/);
});
test('Si la fecha no cubre las nuevas cantidades, no se promete ni revierte la modificación',async()=>{
 const actual={...q,version:4,entregas:[]};const estado={};
 const r=await revisarTrasCambio(q,actual,estado,async()=>{throw Object.assign(Error('No hay cobertura para esa fecha'),{status:400});});
 assert.equal(r.cotizacion,actual);assert.equal(estado.esperando,'ELEGIR_FECHA');assert.match(r.mensaje,/no pude validar/);
});
test('Los botones distinguen reemplazar productos de conservar los demás',()=>{
 const src=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');const fn=src.slice(src.indexOf('function sugerenciasDelMomento(q){'),src.indexOf('function panelCasoPC3()'));
 const r=vm.runInNewContext(`(${fn})(q)`,{q,app:{mensajes:[{rol:'agente',estado_chat:{esperando:'ACLARAR_CAMBIO_PRODUCTOS'}}]}});
 assert.deepEqual(Array.from(r,x=>x[1]),['Reemplazar productos','Conservar los demas','Cancelar']);
});
test('Usar o pagar con mi línea de crédito elige pago sin solicitar ampliación',()=>{
 assert.equal(esPagoCredito('usar mi linea de credito',true),true);assert.equal(esPagoCredito('pagar con mi linea de credito',true),true);assert.equal(esPagoCredito('ampliar mi linea de credito',true),false);assert.equal(esPagoCredito('¿cuánto tengo en mi línea de crédito?',true),false);
});
