import test from 'node:test';
import assert from 'node:assert/strict';
import {interpretarPedidoNuevo,hayLineaNoReconocida} from '../lib/interpretacion-pedido.js';
import {detectarProducto} from '../lib/dialogo.js';
import {extraerProductos} from '../lib/seleccion-productos.js';
import {pidePrecio,preferenciasPrecio,respuestaPrecios,respuestaTotalCotizacion} from '../lib/precios-conversacion.js';
import {intencionVerificableSinLLM} from '../lib/ai.js';
const mensaje='ok si quiero pedir 50 cajas de leche evaoporada y 30 de leche fresca?';
const pares=items=>items.map(({id,cantidad})=>({id,cantidad}));
const cat=[{id_producto:'PRD-002',nombre:'Evaporada',precio:'58.00'},{id_producto:'PRD-003',nombre:'Fresca',precio:'62.00'}];
test('La captura se interpreta en dos líneas y pide confirmación antes de crear',()=>{
 const estado={};const r=interpretarPedidoNuevo(mensaje,estado,null,{motor:'respaldo_groq'});
 assert.equal(r.operaciones,undefined);assert.match(r.mensaje,/50 cajas de leche evaporada.*30 cajas de leche fresca/);
 assert.equal(estado.esperando,'CONFIRMAR_PRODUCTOS_INTERPRETADOS');
 const siguiente=interpretarPedidoNuevo('Sí',estado,null,{});
 assert.deepEqual(pares(siguiente.operaciones),[{id:'PRD-002',cantidad:50},{id:'PRD-003',cantidad:30}]);
});
test('La IA propone las líneas, pero no crea ni cambia nada hasta confirmar',()=>{
 const estado={},ia={motor:'groq',quiere_cambiar_productos:true,lineas_sugeridas:[{id:'PRD-002',cantidad:50},{id:'PRD-003',cantidad:30}]};
 const r=interpretarPedidoNuevo('quisiera cincuenta de evaporada y treinta de fresca',estado,null,ia);
 assert.equal(r.operaciones,undefined);assert.match(r.mensaje,/50 cajas.*30 cajas/);
 assert.equal(interpretarPedidoNuevo('no',estado,null,ia).operaciones,undefined);assert.equal(estado.propuesta_productos,undefined);
});
test('Una variedad desconocida no permite asignar cantidad de otra línea',()=>{
 const frase='quiero 50 cajas de leche desconocida y 30 de leche fresca';
 assert.equal(hayLineaNoReconocida(frase),true);
 const r=interpretarPedidoNuevo(frase,{},null,{motor:'respaldo_groq'});
 assert.equal(r.operaciones,undefined);assert.match(r.mensaje,/No pude identificar/);
});
test('Un error razonable se reconoce como sugerencia y se distingue de un producto exacto',()=>{
 assert.deepEqual(detectarProducto('evaoporada'),{id:'PRD-002',correccion:true});
 assert.equal(detectarProducto('chocolate'),null);
 assert.deepEqual(pares(extraerProductos(mensaje)),[{id:'PRD-002',cantidad:50},{id:'PRD-003',cantidad:30}]);
 assert.equal(intencionVerificableSinLLM(mensaje),false);
});
test('Consulta de precios usa el catálogo y no crea una cotización',()=>{
 assert.equal(pidePrecio('¿Cuánto cuesta 50 cajas de leche fresca?'),true);
 const p=preferenciasPrecio('¿Cuánto cuesta 50 cajas de leche fresca?',{},null);
 const r=respuestaPrecios(cat,p);
 assert.match(r,/62\.00 por caja/);assert.match(r,/3,100\.00/);assert.match(r,/558\.00/);assert.match(r,/3,658\.00/);
 assert.match(r,/sin descuentos/);assert.match(r,/no reservan stock/);
});
test('Precios de varias leches listan solo las solicitadas, sin inventar precio',()=>{
 const p=preferenciasPrecio('precios de evaporada y fresca',{},null);
 assert.deepEqual(p.ids,['PRD-002','PRD-003']);
 assert.match(respuestaPrecios(cat,p),/Evaporada.*Fresca/);
 assert.match(respuestaPrecios([],{ids:['PRD-003'],incierto:false}),/No encuentro/);
});
test('Sin verbo de compra tampoco mezcla una variedad desconocida',()=>{
 const r=interpretarPedidoNuevo('50 cajas de leche desconocida y 30 de leche fresca',{},null,{});
 assert.equal(r.operaciones,undefined);assert.match(r.mensaje,/No pude identificar/);
});
test('Una respuesta afirmativa natural confirma la propuesta, una diferente pide revisar',()=>{
 const estado={};interpretarPedidoNuevo(mensaje,estado,null,{});
 assert.deepEqual(pares(interpretarPedidoNuevo('sí, correcto',estado,null,{}).operaciones),[{id:'PRD-002',cantidad:50},{id:'PRD-003',cantidad:30}]);
 assert.equal(interpretarPedidoNuevo('sí pero cambia a 20',estado,null,{}).operaciones,undefined);
});
test('Si ya hay una cotización al confirmar, pide revisar nuevamente',()=>{
 const estado={};interpretarPedidoNuevo(mensaje,estado,null,{});
 const r=interpretarPedidoNuevo('sí',estado,{estado:'BORRADOR',cantidad:40},{});
 assert.match(r.mensaje,/cotización cambió/);assert.equal(r.operaciones,undefined);
});
test('El precio de una línea desconocida pide aclaración',()=>{
 const p=preferenciasPrecio('precio de 50 cajas de chicharra y 30 de fresca',{},null);
 assert.match(respuestaPrecios(cat,p),/qué leche se trata/);
});
test('El total de la cotización utiliza sus datos y no el precio de lista',async()=>{
 const {respuestaTotalCotizacion}=await import('../lib/precios-conversacion.js');
 const r=respuestaTotalCotizacion('¿cuánto cuesta mi cotización?',{subtotal:100,igv:18,total:118});
 assert.match(r,/100\.00/);assert.match(r,/18\.00/);assert.match(r,/118\.00/);
 assert.equal(respuestaTotalCotizacion('precio de fresca',{total:118}),null);
});
test('Total de dos productos se calcula con precios reales, IGV y cantidades correctas',()=>{
 const p=preferenciasPrecio('¿cuánto sale 50 cajas de evaporada y 30 de fresca?',{},null);
 const r=respuestaPrecios(cat,p);
 assert.equal(pidePrecio('¿cuánto sale 50 cajas de evaporada y 30 de fresca?'),true);
 assert.match(r,/4,760\.00/);assert.match(r,/856\.80/);assert.match(r,/5,616\.80/);
 assert.match(r,/sin descuentos/);
});
test('Consultar stock o descuento no se confunde con pedir precios',()=>{
 assert.equal(pidePrecio('¿cuánto es el stock de fresca?'),false);
 assert.equal(pidePrecio('¿cuánto es el descuento?'),false);
});
test('Una variedad sugerida por IA se consulta en el catálogo, sin aceptar cifras de la IA',()=>{
 const pref=preferenciasPrecio('¿a cuánto me saldría?',{},null,{motor:'groq',producto:'PRD-003',cantidad:100});
 assert.deepEqual(pref.ids,['PRD-003']);assert.equal(pref.cantidad,null);
 const r=respuestaPrecios(cat,pref);assert.match(r,/Fresca.*62\.00/);assert.doesNotMatch(r,/100 cajas/);
});
test('Cuánto sale presenta cantidades y costos por línea antes del total',()=>{
 const q={cantidad:30,descuento_pct:0,subtotal:1780,igv:320.4,total:2100.4,items:[{producto_nombre:'Evaporada',cantidad:20,unidades_caja:24,precio_unitario:58,subtotal:1160},{producto_nombre:'Fresca',cantidad:10,unidades_caja:12,precio_unitario:62,subtotal:620}]};
 const r=respuestaTotalCotizacion('ya cuanto sale?',q);
 assert.match(r,/Evaporada: 20 cajas.*480 unidades.*1,160/);assert.match(r,/Fresca: 10 cajas.*120 unidades.*620/);assert.match(r,/2,100.40/);
});
