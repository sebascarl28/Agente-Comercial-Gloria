import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {confirmacionFlexible,sinRelleno} from '../lib/flexibilidad.js';
import {leerTurno} from '../lib/dialogo.js';

const ia=(accion,extra={})=>({proveedor_ia:'deepseek',accion,...extra});
const conf=(texto,esperando,interpretacion={})=>confirmacionFlexible(texto,interpretacion,{esperando});
const q={id_cotizacion:'x',id_producto:'PRD-002',items:[{id_producto:'PRD-002',cantidad:50}],entregas:[{cajas:50,id_producto:'PRD-002',fecha:'2026-11-21'}],entrega_aceptada:false};
const chat=readFileSync(new URL('../api/chat.js',import.meta.url),'utf8');

test('Las reglas toleran relleno y cortesía en un sí o un no',()=>{
  for(const texto of ['sí, por favor','claro que sí','bueno, ya','dale pues','siii','por supuesto','me parece perfecto','de acuerdo, gracias','ya, ok','esta perfecto','adelante'])
    assert.deepEqual(conf(texto,'ACEPTAR_ENTREGA'),{valor:'SI',via:'reglas'},texto);
  for(const texto of ['no gracias','mejor no','todavía no','no por ahora','la rechazo','no, gracias'])
    assert.deepEqual(conf(texto,'ACEPTAR_ENTREGA'),{valor:'NO',via:'reglas'},texto);
  assert.equal(sinRelleno('bueno, sí, por favor'),'sí');
  assert.equal(sinRelleno('ya'),'ya','una palabra de relleno sola se conserva: no se borra el mensaje');
});
test('Con condiciones, preguntas o cifras no se interpreta como sí o no: el agente pregunta',()=>{
  for(const texto of ['sí, pero el 28','sí?','ok para el 21','sí, con 10% de descuento','acepto pero cambia el pago','sí, y mándalo a otra dirección'])
    assert.equal(conf(texto,'ACEPTAR_ENTREGA',ia('aceptar')),null,texto);
});
test('Solo se interpreta un sí o un no cuando el agente acaba de preguntar algo de sí o no',()=>{
  for(const esperando of ['PEDIR_CANTIDAD','ELEGIR_PAGO','ELEGIR_FECHA','PEDIR_PRODUCTO',undefined])
    assert.equal(conf('sí, por favor',esperando),null,String(esperando));
  for(const esperando of ['ACEPTAR_ENTREGA','ACEPTAR_DESCUENTO','CONFIRMAR_DIRECCION','CONFIRMAR_PEDIDO'])
    assert.equal(conf('sí, por favor',esperando)?.valor,'SI',esperando);
});
test('La IA ayuda con un sí o un no que las reglas no reconocen, pero solo con proveedor activo y sin condiciones',()=>{
  const frase='me parece estupendo lo que propones';
  assert.deepEqual(conf(frase,'ACEPTAR_ENTREGA',ia('aceptar')),{valor:'SI',via:'ia'});
  assert.deepEqual(conf('prefiero dejarlo asi, gracias, no sigo','ACEPTAR_ENTREGA',ia('rechazar')),{valor:'NO',via:'ia'});
  assert.equal(conf(frase,'ACEPTAR_ENTREGA',{accion:'aceptar'}),null,'sin IA activa (solo reglas) no se adivina');
  assert.equal(conf(frase,'ACEPTAR_ENTREGA',ia('conversar')),null);
  assert.equal(conf('acepto aunque lo cambiaría','ACEPTAR_ENTREGA',ia('aceptar')),null);
});
test('La confirmación final del pedido nunca depende de la IA',()=>{
  assert.equal(conf('me encantó, adelante con todo','CONFIRMAR_PEDIDO',ia('aceptar')),null);
  assert.equal(conf('estupendo, procedamos','CONFIRMAR_PEDIDO',ia('aceptar')),null);
  assert.equal(conf('sí, por favor','CONFIRMAR_PEDIDO')?.via,'reglas','el relleno sí se tolera con reglas');
});
test('La IA puede proponer una fecha que las reglas no entienden, y se valida como cualquier otra',()=>{
  const turno=(texto,interp,esperando='ELEGIR_FECHA')=>leerTurno(texto,{estado:{hoy:'2026-11-19',esperando,producto:'PRD-002'},cotizacion:q,interpretacion:interp});
  let t=turno('lo quiero pasando el feriado largo',ia('entrega',{fecha_deseada:'2026-11-30'}));
  assert.equal(t.fecha,'2026-11-30');assert.equal(t.fechaViaIA,true);assert.equal(t.accion,'FECHA');
  t=turno('lo quiero pasando el feriado largo',ia('entrega',{fecha_deseada:'2026-11-10'}));
  assert.equal(t.fecha,null);assert.equal(t.fechaPasada,'2026-11-10');
  t=turno('lo quiero para el próximo siglo',ia('entrega',{fecha_deseada:'2030-01-01'}));
  assert.equal(t.fecha,null,'más de un año no se acepta');
  t=turno('hola, gracias',ia('entrega',{fecha_deseada:'2026-11-30'}));
  assert.equal(t.fecha,null,'si el mensaje no habla de fechas, la IA no puede inventar una');
  t=turno('lo quiero pasando el feriado largo',{accion:'entrega',fecha_deseada:'2026-11-30'});
  assert.equal(t.fecha,null,'sin proveedor de IA activo no se usa');
  t=turno('50',ia('cantidad',{fecha_deseada:'2026-11-30'}),'PEDIR_CANTIDAD');
  assert.equal(t.fecha,null,'un número suelto no es una fecha');
});
test('El chat usa la interpretación flexible, deja el mensaje original en el historial y registra cómo se interpretó',()=>{
  assert.match(chat,/confirmacionFlexible\(textoCliente,interpretacion,estado\)/);
  assert.match(chat,/\{rol:'cliente',texto:textoCliente,/);
  assert.match(chat,/Interpretación de la IA validada por reglas ERP\/CRM/);
  assert.match(chat,/interpretar\(texto,\{/,'a la IA se le envía el mensaje original, antes de cualquier ajuste');
});
