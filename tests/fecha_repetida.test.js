import test from 'node:test';
import assert from 'node:assert/strict';
import {coincideFechaPropuesta,esAceptacionEntrega,esAceptacionEntregaIA} from '../lib/dialogo.js';
import {readFileSync} from 'node:fs';

test('repite 16 de noviembre: coincide, pero no equivale a aceptar',()=>{
  const propuesta=[{cajas:100,fecha:'2026-11-16'}];
  assert.equal(coincideFechaPropuesta(propuesta,'2026-11-16'),true);
  assert.equal(esAceptacionEntrega('Las necesito para el 16 de noviembre de 2026.'),false);
});
test('fecha diferente o reparto de dos días requiere revisión',()=>{
  assert.equal(coincideFechaPropuesta([{fecha:'2026-11-16'}],'2026-11-17'),false);
  assert.equal(coincideFechaPropuesta([{fecha:'2026-11-16'},{fecha:'2026-11-17'}],'2026-11-16'),false);
  assert.equal(coincideFechaPropuesta([],'2026-11-16'),false);
});
test('acepta la fecha pendiente con frases naturales, sin aceptar cambios ambiguos',()=>{
  for(const texto of ['si okey','acepto esa fehca','fecha aceptada','sí, de acuerdo con esa fecha','Acepto la entrega'])
    assert.equal(esAceptacionEntrega(texto),true,texto);
  for(const texto of ['si okey pero quiero otra fecha','acepto la fecha del 28','fecha no aceptada','quiero cambiar la fecha','27/11/2026'])
    assert.equal(esAceptacionEntrega(texto),false,texto);
});
test('DeepSeek puede reconocer una aceptación natural, pero no cambios de propuesta',()=>{
  const ia={proveedor_ia:'deepseek',accion:'aceptar'};
  assert.equal(esAceptacionEntregaIA('Me parece perfecto así',ia),true);
  assert.equal(esAceptacionEntregaIA('Sí, pero para el 28',ia),false);
  assert.equal(esAceptacionEntregaIA('¿Me parece bien esa fecha?',ia),false);
  assert.equal(esAceptacionEntregaIA('Me parece perfecto así',{accion:'aceptar'}),false);
});
test('el handler conserva propuesta y solicita aceptación clara',()=>{
  const src=readFileSync(new URL('../api/chat.js',import.meta.url),'utf8');
  assert.match(src,/coincideFechaPropuesta\(q\.entregas,d\.fecha\)/);
  assert.match(src,/necesito tu aceptación/);
  assert.match(src,/estado\.esperando='ACEPTAR_ENTREGA'/);
});
