import test from 'node:test';
import assert from 'node:assert/strict';
import {leerTurno,estadoAnterior,productoExplicito,cantidadExplicita,esTodoStock,esConsultaStock} from '../lib/dialogo.js';
import {repartoSugerido} from '../lib/rules.js';
const ctx={estado:{producto:'PRD-003',esperando:'PEDIR_CANTIDAD',hoy:'2026-11-13'},interpretacion:{accion:'conversar'}};
const leer=(t,x=ctx)=>leerTurno(t,x);

test('Pregunta de stock no exige cantidad ni crea cotización automáticamente',()=>{
  assert.equal(leer('fresaca, quiero ver cuánto es el stock').accion,'STOCK');
  assert.equal(leer('fresaca, quiero ver cuánto es el stock').producto,'PRD-003');
  assert.equal(leer('¿Cuánto stock disponible hay de UHT?').producto,'PRD-001');
  assert.equal(esConsultaStock('cuanto stock tienes'),true);
});
test('Todo el stock usa el producto recordado',()=>{
  const r=leer('osea quiero pedirte todo el stock que tienes');
  assert.equal(r.accion,'TODO_STOCK');assert.equal(r.producto,'PRD-003');
  assert.equal(esTodoStock('quiero todo el stock'),true);
});
test('Cantidad explícita puede llegar en turno separado del producto',()=>{
  assert.equal(leer('ya necesito 300 cajas').accion,'CANTIDAD');
  assert.equal(leer('ya necesito 300 cajas').cantidad,300);
  assert.equal(leer('300 cajas de leche fresca').producto,'PRD-003');
  assert.equal(leer('quiero pedir 300 cajas de leche gloria').producto,'PRD-003');
  assert.equal(productoExplicito('leche gloria'),null);
  assert.equal(cantidadExplicita('300 cajas de leche fresca'),300);
});
test('Si no se conoce producto, no se inventa que Gloria significa UHT',()=>{
  const r=leer('quiero pedir 300 cajas de leche gloria',{estado:{hoy:'2026-11-13'},interpretacion:{accion:'conversar'}});
  assert.equal(r.accion,'CANTIDAD');assert.equal(r.producto,null);
});
test('No se confunden cantidades de dos despachos con cambio total',()=>{
  const r=leer('quiero 80 cajas primero y 70 cajas después');
  assert.equal(r.accion,'ENTREGA');assert.equal(r.modo,'DOS_PARTES');
});
test('Fechas cortas o naturales conservan año correcto',()=>{
  assert.equal(leer('osea ya para el 17/11').fecha,'2026-11-17');
  assert.equal(leer('el 17 de noviembre').fecha,'2026-11-17');
  assert.equal(leer('para esta semana?').accion,'FECHA_RELATIVA');
  assert.equal(leer('dentro de una semana').fecha,'2026-11-20');
});
test('Entrega parcial o total como respuestas cortas',()=>{
  assert.equal(leer('si una entrega parcial').modo,'DOS_PARTES');
  assert.equal(leer('completa se podrá?').modo,'TODO_DESPUES');
  assert.equal(leer('acepto la entrega').accion,'SI');
});
test('Crédito y nueva dirección en un mismo mensaje',()=>{
  const r=leer('al credito, para ate vitarte los giralose calle 17');
  assert.equal(r.accion,'PAGO');assert.equal(r.pago,'CREDITO');
  assert.equal(r.direccion.distrito,'Ate');
  assert.equal(r.direccion.direccion,'calle 17');
});
test('Respuestas comerciales y descuento opcional',()=>{
  assert.equal(leer('sin descuento').accion,'SIN_DESCUENTO');
  assert.equal(leer('quiero el 8% de descuento').descuentoPct,8);
  assert.equal(leer('confirmo la dirección').accion,'SI');
});
test('Excepción real: 300 fresca, 90 liberadas, 60 futuras, 150 sin plan',()=>{
  const c=repartoSugerido(300,90,60,'2026-11-17','2026-11-13');
  assert.deepEqual([c.inmediato,c.futuro,c.sin_cobertura],[90,60,150]);
});
test('Excepción recuperable: 300 UHT, 250 liberadas, 50 futuras',()=>{
  const c=repartoSugerido(300,250,50,'2026-11-19','2026-11-13');
  assert.equal(c.sin_cobertura,0); assert.equal(c.fecha2,'2026-11-19');
});
test('Estado comercial se persiste dentro de mensajes de la sesión actual',()=>{
  const mensajes=[{rol:'agente',texto:'¿Qué leche?',estado_chat:{producto:'PRD-003',esperando:'PEDIR_CANTIDAD'}},{rol:'cliente',texto:'300 cajas'}];
  assert.deepEqual(estadoAnterior(mensajes),{producto:'PRD-003',esperando:'PEDIR_CANTIDAD'});
});
test('Backend conserva separación por sesión y no exige SQL nuevo', async()=>{
  const {readFileSync}=await import('node:fs');
  const code=readFileSync(new URL('../api/chat.js',import.meta.url),'utf8');
  assert.match(code,/enSimulacion\(req,\(\)=>atender\(req,res\)\)/);
  assert.match(code,/estado_chat:estado/);
  assert.match(code,/await disponibilidad\(prod\)/);
  assert.match(code,/s\.sin_cobertura>0/);
  assert.match(code,/proponerEntrega\(q\.id_cotizacion,\{modo:'DOS_PARTES'\}\)/);
});

test('El servicio permite entregas parciales voluntarias aun con stock suficiente', async()=>{
  const {readFileSync}=await import('node:fs');
  const code=readFileSync(new URL('../lib/service.js',import.meta.url),'utf8');
  assert.match(code,/Entrega parcial voluntaria/);
  assert.match(code,/Math\.ceil\(q\.cantidad\/2\)/);
  assert.match(code,/sumarDias\(s\.fecha1,3\)/);
});

test('No ofrece 100 cajas previstas el primer día si hay dos planes de 50 en fechas distintas',async()=>{
  const {fechaCobertura}=await import('../lib/rules.js');
  const planes=[{libres:50,fecha_disponibilidad:'2026-11-19'},{libres:50,fecha_disponibilidad:'2026-11-21'}];
  assert.equal(fechaCobertura(planes,100),'2026-11-21');
  assert.equal(fechaCobertura(planes,50),'2026-11-19');
  assert.equal(fechaCobertura(planes,0),null);
});

test('Propuesta de entregas parciales con cantidades específicas del cliente',async()=>{
 const {cantidadesParciales}=await import('../lib/dialogo.js');
 assert.deepEqual(cantidadesParciales('Quiero 100 cajas primero y 100 después'),[100,100]);
 assert.deepEqual(cantidadesParciales('200 ahora y 100 luego'),[200,100]);
 assert.deepEqual(cantidadesParciales('80 cajas primero y 70 cajas después'),[80,70]);
 const d=leer('Quiero 100 cajas primero y 100 después');
 assert.equal(d.accion,'ENTREGA');assert.deepEqual(d.partes,[100,100]);
});

test('Pregunta si hay stock para 300 cajas sin iniciar pedido',()=>{
 const r=leer('¿Tienes stock para 300 cajas de leche fresca?');
 assert.equal(r.accion,'STOCK_CANTIDAD');
 assert.equal(r.producto,'PRD-003');
 assert.equal(r.cantidad,300);
});

test('Reducir cantidad exige consentimiento explícito, no un sí a entrega parcial',async()=>{
 const {confirmaReduccion}=await import('../lib/dialogo.js');
 assert.equal(confirmaReduccion('sí prefiero una entrega parcial',150),false);
 assert.equal(confirmaReduccion('sí',150),false);
 assert.equal(confirmaReduccion('acepto reducir a 150 cajas',150),true);
 assert.equal(confirmaReduccion('ajustar a 150 cajas',150),true);
 assert.equal(confirmaReduccion('acepto reducir a 200 cajas',150),false);
 const {readFileSync}=await import('node:fs');
 const code=readFileSync(new URL('../api/chat.js',import.meta.url),'utf8');
 assert.match(code,/estado\.esperando==='REDUCIR_CANTIDAD' && confirmaReduccion\(texto,estado\.cantidad_ofrecida\)/);
 assert.match(code,/estado\.esperando==='REDUCIR_CANTIDAD' && d\.modo==='DOS_PARTES'/);
});
