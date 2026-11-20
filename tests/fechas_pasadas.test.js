import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fechaSinAnio} from '../lib/rules.js';
import {leerTurno} from '../lib/dialogo.js';
import {respuestaRespaldo} from '../lib/ai.js';
import {fechaLarga} from '../lib/formato.js';

const turno=texto=>leerTurno(texto,{estado:{hoy:'2026-11-19',producto:'PRD-002'},cotizacion:{id_cotizacion:'x',id_producto:'PRD-002',items:[]},interpretacion:{}});

test('Una fecha sin año que ya pasó hace poco no se corre al año siguiente: se avisa',()=>{
  assert.equal(fechaSinAnio('16','11','2026-11-19'),'2026-11-16');
  assert.equal(fechaSinAnio('10','10','2026-11-19'),'2026-10-10');
  assert.equal(fechaSinAnio('25','11','2026-11-19'),'2026-11-25');
  assert.equal(fechaSinAnio('05','01','2026-12-20'),'2027-01-05','enero en diciembre sí es del año que viene');
});
test('Una fecha pasada no se propone como entrega',()=>{
  for(const texto of ['16/11','lo quiero para el 16/11','el 16 de noviembre','el 16 de noviembre de 2026','el 10 de octubre']){
    const t=turno(texto);
    assert.equal(t.fecha,null,texto);
    assert.ok(t.fechaPasada&&t.fechaPasada<'2026-11-19',`${texto} -> ${t.fechaPasada}`);
  }
});
test('Las fechas futuras siguen funcionando',()=>{
  assert.equal(turno('el 25/11').fecha,'2026-11-25');
  assert.equal(turno('para el 3 de diciembre').fecha,'2026-12-03');
  assert.equal(turno('el 5/1').fecha,'2027-01-05'.replace('2027','2027'));
  assert.equal(turno('para mañana').fecha,'2026-11-20');
  assert.equal(turno('el 25/11').fechaPasada,null);
});
test('El chat responde con una disculpa amable y pide otra fecha en vez de aceptarla',()=>{
  const chat=readFileSync(new URL('../api/chat.js',import.meta.url),'utf8');
  assert.match(chat,/d\.fechaPasada && !cerrado/);
  assert.match(chat,/ya pasó \(hoy es \$\{fecha\(estado\.hoy\)\}\)/);
});
test('El año solo se muestra cuando la fecha es de otro año',()=>{
  assert.equal(fechaLarga('2027-01-05','2026-11-19'),'5 de enero de 2027');
  assert.equal(fechaLarga('2026-11-23','2026-11-19'),'23 de noviembre');
});
test('Las respuestas de cortesía son profesionales y orientan al cliente',()=>{
  const saludo=respuestaRespaldo('hola');
  assert.match(saludo,/Bienvenido a Gloria/);assert.match(saludo,/UHT, evaporada o fresca/);
  for(const texto of ['hola','gracias','estoy triste','hola soy un tanque volador','mmm'])assert.doesNotMatch(respuestaRespaldo(texto),/😊|😄|con la leche\?/);
});
