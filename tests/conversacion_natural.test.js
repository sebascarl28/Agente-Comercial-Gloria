import test from 'node:test';
import assert from 'node:assert/strict';
import {avanzarSeleccion,extraerProductos} from '../lib/seleccion-productos.js';
import {cantidadExplicita,leerTurno,detectarProducto} from '../lib/dialogo.js';

const pares=xs=>xs.map(({id,cantidad})=>({id,cantidad}));
test('No confunde la cantidad de productos con cajas, incluso si la IA adivina una cantidad',()=>{
  const estado={hoy:'2026-11-13'};
  assert.equal(cantidadExplicita('quiero 2 productos'),null);
  const r=avanzarSeleccion('quiero 2 productos',estado);
  assert.match(r.mensaje,/cu[aá]les/i);
  assert.deepEqual(estado.seleccion_productos.items,[]);
});
test('Conversación conserva fresca y entera y solicita cajas para cada una',()=>{
  const estado={hoy:'2026-11-13'};
  avanzarSeleccion('quiero 2 productos',estado);
  const tipo=avanzarSeleccion('quiero pedir leche freca y entera me entiendes?',estado);
  assert.match(tipo.mensaje,/fresca.*entera/i);
  assert.match(tipo.mensaje,/cu[aá]ntas cajas.*cada una/i);
  assert.match(avanzarSeleccion('30',estado).mensaje,/cu[aá]ntas cajas.*entera/i);
  const final=avanzarSeleccion('10 cajas',estado);
  assert.deepEqual(pares(final.operaciones),[{id:'PRD-003',cantidad:30},{id:'PRD-001',cantidad:10}]);
});
test('Acepta cantidades separadas en el mismo mensaje sin mezclar productos ni fechas',()=>{
 assert.deepEqual(pares(extraerProductos('30 cajas de leche fresca y 10 de UHT')),[{id:'PRD-003',cantidad:30},{id:'PRD-001',cantidad:10}]);
 assert.deepEqual(pares(extraerProductos('fresca y entera para el 16')),[{id:'PRD-003',cantidad:null},{id:'PRD-001',cantidad:null}]);
 assert.deepEqual(pares(extraerProductos('fresca 1 L y evaporada 400 g')),[{id:'PRD-003',cantidad:null},{id:'PRD-002',cantidad:null}]);
});
test('Un número aislado responde a la pregunta de cantidad, no es fecha',()=>{
 const r=leerTurno('30',{estado:{esperando:'PEDIR_CANTIDAD',producto:'PRD-003',hoy:'2026-11-13'},interpretacion:{accion:'entrega'}});
 assert.equal(r.accion,'CANTIDAD');assert.equal(r.cantidad,30);assert.equal(r.fecha,null);
});
test('Errores comunes se reconocen; siglas dudosas necesitan aclaración',()=>{
 assert.equal(detectarProducto('leche freca').id,'PRD-003');
 assert.equal(detectarProducto('leche freca').correccion,false);
 const estado={};const r=avanzarSeleccion('quiero fresca y UTHD',estado);
 assert.match(r.mensaje,/asegurarme/i);assert.equal(estado.seleccion_productos,undefined);
});
test('No altera una línea ya existente ni interfiere con una consulta de stock',()=>{
 const q={estado:'BORRADOR',items:[{id_producto:'PRD-003',cantidad:20}]};
 const estado={};const r=avanzarSeleccion('quiero 30 fresca y 10 entera',estado,q);
 assert.match(r.mensaje,/sumar o modificar/i);assert.equal(r.operaciones,undefined);
 assert.equal(avanzarSeleccion('¿cuánto stock de fresca y entera tienen?',{},null),null);
});
test('Si pidió dos productos y menciona solo uno, pregunta por el otro',()=>{
 const estado={};
 avanzarSeleccion('quiero 2 productos',estado);
 assert.match(avanzarSeleccion('leche freca',estado).mensaje,/otra leche/i);
 assert.match(avanzarSeleccion('entera',estado).mensaje,/cu[aá]ntas cajas.*cada una/i);
});
test('Una comparación de productos no comienza una cotización',()=>{
 assert.equal(avanzarSeleccion('quiero comparar precio de fresca y entera',{}),null);
});


test('El caso de la captura asigna 100 cajas a cada una de las dos leches',()=>{
 const estado={};
 avanzarSeleccion('quiero 2 productos',estado);
 avanzarSeleccion('la entera y fresca',estado);
 const r=avanzarSeleccion('necesito 100 cajas de cada una',estado);
 assert.deepEqual(pares(r.operaciones),[{id:'PRD-001',cantidad:100},{id:'PRD-003',cantidad:100}]);
});
test('Cantidades distintas pueden darse juntas después de elegir las leches',()=>{
 const estado={};
 avanzarSeleccion('quiero 2 productos',estado);
 avanzarSeleccion('entera y fresca',estado);
 const r=avanzarSeleccion('100 de entera y 50 de fresca',estado);
 assert.deepEqual(pares(r.operaciones),[{id:'PRD-001',cantidad:100},{id:'PRD-003',cantidad:50}]);
});
test('Una cantidad sin cada una solo corresponde a la primera leche pendiente',()=>{
 const estado={};avanzarSeleccion('entera y fresca',estado);
 const r=avanzarSeleccion('100 cajas',estado);
 assert.equal(r.operaciones,undefined);assert.match(r.mensaje,/fresca/i);
 assert.deepEqual(pares(estado.seleccion_productos.items),[{id:'PRD-001',cantidad:100},{id:'PRD-003',cantidad:null}]);
});
test('No aplica una cantidad común cuando todavía faltan tipos por seleccionar',()=>{
 const estado={};avanzarSeleccion('quiero 2 productos',estado);
 avanzarSeleccion('fresca',estado);
 const r=avanzarSeleccion('100 cajas de cada una',estado);
 assert.equal(r.operaciones,undefined);assert.match(r.mensaje,/otra leche/i);
});
