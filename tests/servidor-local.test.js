import test from 'node:test';
import assert from 'node:assert/strict';
import {crearServidor} from '../servidor-local.js';

test('servidor local sirve la interfaz y el endpoint de salud sin Vercel',async t=>{
  const servidor=crearServidor();
  await new Promise(resolve=>servidor.listen(0,resolve));
  t.after(()=>new Promise(resolve=>servidor.close(resolve)));
  const base=`http://127.0.0.1:${servidor.address().port}`;

  const pagina=await fetch(base+'/');
  assert.equal(pagina.status,200);
  assert.match(pagina.headers.get('content-type'),/text\/html/);
  assert.ok((await pagina.text()).length>100);

  const salud=await fetch(base+'/api/health');
  assert.equal(salud.status,200);
  const datos=await salud.json();
  assert.equal(typeof datos.ok,'boolean');
  assert.ok(datos.base&&datos.groq);

  const otro=await fetch(base+'/api/no-existe');
  assert.equal(otro.status,404);
});
