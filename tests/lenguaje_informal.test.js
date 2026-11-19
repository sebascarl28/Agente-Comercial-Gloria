import test from 'node:test';
import assert from 'node:assert/strict';
import {corregirEscritura} from '../lib/escritura.js';
import {productoExplicito,cantidadExplicita,leerTurno,ultimaRespuestaPidePedido} from '../lib/dialogo.js';
import {respaldo,fechaEscrita} from '../lib/ai.js';

test('Se corrige la escritura descuidada sin tocar números ni palabras correctas',()=>{
  assert.equal(corregirEscritura('kiero lech fesca'),'quiero leche fresca');
  assert.equal(corregirEscritura('nesecito 20 cajs d evaporda xfa'),'necesito 20 cajas de evaporada por favor');
  assert.equal(corregirEscritura('holaaa'),'hola');
  assert.equal(corregirEscritura('quiero 1000 cajas'),'quiero 1000 cajas');
  assert.equal(corregirEscritura('Necesito leche'),'Necesito leche');
});
test('Se entiende el producto aunque esté mal escrito',()=>{
  for(const [texto,id] of [['kiero lech fesca','PRD-003'],['kiero 30 cajas d lehe frezka','PRD-003'],['nesecito 20 cajs de evaporda','PRD-002'],['ps quiero 10 de la fresca','PRD-003'],['dame leche uth 100','PRD-001'],['xfa manda 50 cajas de la entera','PRD-001']])
    assert.equal(productoExplicito(texto),id,texto);
});
test('Se entiende la cantidad con y sin la palabra «cajas»',()=>{
  assert.equal(cantidadExplicita('nesecito 20 cajs de evaporda'),20);
  assert.equal(cantidadExplicita('dame leche uth 100'),100);
  assert.equal(cantidadExplicita('quiero fresca 50'),50);
  assert.equal(cantidadExplicita('quiero 5% de descuento'),null);
});
test('El respaldo sin IA interpreta pedidos descuidados como pedidos',()=>{
  for(const [texto,id,n] of [['kiero 30 cajas d lehe frezka','PRD-003',30],['nesecito 20 cajs de evaporda','PRD-002',20],['dame leche uth 100','PRD-001',100]]){
    const r=respaldo(texto,{fecha_hoy:'2026-11-19'});
    assert.equal(r.accion,'cotizar',texto);assert.equal(r.producto,id);assert.equal(r.cantidad,n);
    const turno=leerTurno(texto,{estado:{hoy:'2026-11-19'},cotizacion:null,interpretacion:r});
    assert.equal(turno.accion,'CANTIDAD',texto);assert.equal(turno.cantidad,n);
  }
});
test('Los días de la semana se convierten en la próxima fecha',()=>{
  // 19/11/2026 es jueves.
  assert.equal(fechaEscrita('pa el viernes xfa','2026-11-19'),'2026-11-20');
  assert.equal(fechaEscrita('lo quiero el lunes','2026-11-19'),'2026-11-23');
  assert.equal(fechaEscrita('el jueves','2026-11-19'),'2026-11-26');
});
test('El agente reconoce su propia pregunta de confirmación en el tono nuevo',()=>{
  assert.equal(ultimaRespuestaPidePedido('¡Listo, ya tenemos todo! Abajo te dejo el resumen de tu pedido. ¿Lo confirmo con estas condiciones?'),true);
});
