import test from 'node:test';
import assert from 'node:assert/strict';
import {coincideFechaPropuesta,esAceptacionEntrega} from '../lib/dialogo.js';
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
test('el handler conserva propuesta y solicita aceptación clara',()=>{
  const src=readFileSync(new URL('../api/chat.js',import.meta.url),'utf8');
  assert.match(src,/coincideFechaPropuesta\(q\.entregas,d\.fecha\)/);
  assert.match(src,/necesito tu aceptación/);
  assert.match(src,/estado\.esperando='ACEPTAR_ENTREGA'/);
});
