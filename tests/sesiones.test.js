import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=join(dirname(fileURLToPath(import.meta.url)),'..');
const file=p=>readFileSync(join(root,p),'utf8');
test('Todos los endpoints operativos están aislados por sesión',()=>{
  for(const x of ['chat','bootstrap','action','gestion']){
    assert.match(file(`api/${x}.js`),/enSimulacion\(req,\(\)=>atender\(req,res\)\)/);
  }
});
test('La sesión viaja por header y hay nueva simulación',()=>{
  const s=file('public/app.js');
  assert.match(s,/sessionStorage\.setItem\(DEMO_SESION_KEY/);
  assert.match(s,/X-Demo-Session/);
  assert.match(s,/data-nueva-simulacion/);
});
test('Connection pooler: búsqueda de esquema usa SET LOCAL en transacción',()=>{
  const s=file('lib/db.js');
  assert.match(s,/SET LOCAL search_path/);
  assert.match(s,/await cn.query\('BEGIN'\)/);
  assert.match(s,/await cn.query\('COMMIT'\)/);
});
test('Datos base y sesiones separadas en SQL de instalación',()=>{
  const s=file('sql/03_simulaciones_aisladas.sql');
  assert.match(s,/CREATE TABLE IF NOT EXISTS public.demo_sesiones/);
  assert.match(s,/FROM public.stock_lotes/);
  assert.match(s,/WHEN 'LOT-UHT-01' THEN 250/);
  assert.match(s,/WHEN 'PPPI-UHT-01' THEN 50/);
  assert.match(s,/THEN 30000 ELSE 0/);
});
