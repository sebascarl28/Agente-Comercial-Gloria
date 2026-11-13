import test from 'node:test';
import assert from 'node:assert/strict';
import {aceptaRepartoPropuesto,mencionaRepartoConAceptacion} from '../lib/dialogo.js';
import {readFileSync} from 'node:fs';

const entregas=[
  {id_producto:'PRD-001',cajas:180,fecha:'2026-11-16'},
  {id_producto:'PRD-002',cajas:40,fecha:'2026-11-16'},
  {id_producto:'PRD-003',cajas:120,fecha:'2026-11-16'},
  {id_producto:'PRD-002',cajas:20,fecha:'2026-11-17'}
];

test('PC3: acepta las 340 cajas del 16 y 20 del 17',()=>{
  assert.equal(mencionaRepartoConAceptacion('Sí, acepto 340 para el 16 y 20 de evaporada para el 17'),true);
  assert.equal(aceptaRepartoPropuesto('Sí, acepto 340 para el 16 y 20 de evaporada para el 17',entregas),true);
  assert.equal(aceptaRepartoPropuesto('Acepto 340 cajas el 16/11 y 20 cajas el 17/11',entregas),true);
  assert.equal(aceptaRepartoPropuesto('Sí, confirmo 340 el 16/11/2026 y 20 el 17/11/2026',entregas),true);
});
test('PC3: no confunde fechas ni acepta cifras diferentes',()=>{
  assert.equal(aceptaRepartoPropuesto('Acepto 340 para el 17 y 20 para el 16',entregas),false);
  assert.equal(aceptaRepartoPropuesto('Acepto 350 para el 16 y 10 para el 17',entregas),false);
  assert.equal(aceptaRepartoPropuesto('No acepto 340 para el 16 y 20 para el 17',entregas),false);
  assert.equal(aceptaRepartoPropuesto('Acepto 340 para el 16 y 20 para el 18',entregas),false);
});
test('Caso PC3 registra el reparto antes de pedir aceptación',()=>{
  const chat=readFileSync(new URL('../api/chat.js',import.meta.url),'utf8');
  const ui=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
  assert.match(chat,/const reparto=await proponerEntrega\(q\.id_cotizacion,\{modo:'DOS_PARTES'\}\)/);
  assert.match(chat,/aceptaRepartoPropuesto\(texto,q\.entregas\)/);
  assert.match(ui,/Caso PC3 · 360 cajas/);
  assert.match(ui,/diagnostico_groq/);
});
