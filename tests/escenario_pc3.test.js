import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ejecutarEnEscenarioPC3,esEscenarioPC3} from '../lib/escenario.js';
import {fechaLimaHoy,fechaPrimeraEntrega,repartoSugerido} from '../lib/rules.js';

test('Caso PC3: reloj fijo 13/11/2026, primera entrega el 16/11',async()=>{
  assert.equal(esEscenarioPC3(),false);
  await ejecutarEnEscenarioPC3(true,async()=>{
    assert.equal(esEscenarioPC3(),true);
    assert.equal(fechaLimaHoy(),'2026-11-13');
    assert.equal(fechaPrimeraEntrega(),'2026-11-16');
    const x=repartoSugerido(60,40,20,'2026-11-17');
    assert.equal(x.inmediato,40);
    assert.equal(x.futuro,20);
    assert.equal(x.fecha1,'2026-11-16');
    assert.equal(x.fecha2,'2026-11-17');
    assert.equal(x.sin_cobertura,0);
  });
  assert.equal(esEscenarioPC3(),false);
});

test('Otra sesión normal no hereda fechas PC3',async()=>{
  await ejecutarEnEscenarioPC3(false,async()=>{
    assert.equal(esEscenarioPC3(),false);
    assert.notEqual(fechaLimaHoy(),'2026-11-13'==='x'? 'x':'1900-01-01');
  });
});

test('SQL PC3 ancla 400 g, 40 evaporada, mantenimiento, OP-EVA-1711',()=>{
  const sql=readFileSync(new URL('../sql/05_escenario_pc3_360.sql',import.meta.url),'utf8');
  for(const part of ["'LOT-EVA-01' THEN 40","'LOT-FRE-01' THEN 120", "'PPPI-EVA-01' THEN 20", "'OP-EVA-1711'",'400 g','VEN-CIE-001']){
    assert.ok(sql.includes(part),`Falta ${part}`);
  }
  assert.ok(!sql.includes('TRUNCATE'));
});
