import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const ui=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const chat=readFileSync(new URL('../api/chat.js',import.meta.url),'utf8');

test('caso PC3 se puede iniciar escribiendo, sin pulsar un botón',()=>{
  assert.match(ui,/function solicitaCasoPC3\(texto/);
  assert.match(ui,/sessionStorage\.setItem\(PENDIENTE_MENSAJE_PC3,msg\)/);
  assert.match(ui,/location\.assign\('\/\?escenario=pc3'\)/);
  assert.match(ui,/await sendChat\(\)/);
  assert.doesNotMatch(ui,/data-chat-suggest="Quiero preparar el caso PC3 del informe"/);
});

test('la respuesta del caso PC3 se activa por intención de preparar, no solo por mencionarlo',()=>{
  assert.match(chat,/if\(esEscenarioPC3\(\) && /);
  assert.match(chat,/hagamos\|hacer\|probar/);
  assert.match(chat,/340 cajas el 16/);
  assert.match(chat,/20 de evaporada el 17/);
});

test('resumen final usa condiciones reales de la cotización confirmada',()=>{
  const match=chat.match(/function resumenPedidoConversado\(q\)\{[\s\S]*?\n\}/);
  assert.ok(match,'La función de resumen final debe existir');
  const fecha=x=>x;
  const nombres={'PRD-001':'leche UHT','PRD-002':'leche evaporada'};
  const obtener=new Function('nombres','fecha',match[0]+';return resumenPedidoConversado;');
  const resumen=obtener(nombres,fecha);
  const q={estado:'CONFIRMADA',items:[{cantidad:100,producto_nombre:'Leche UHT Gloria Entera 1 L',disponibilidad:{disponibles:150}}],
    entregas:[{cajas:100,id_producto:'PRD-001',origen:'STOCK',fecha:'2026-11-16'}],
    forma_pago:'CONTADO',descuento_pct:0,calculo:{total:7080}};
  const m=resumen(q);
  for(const texto of ['100 cajas','16/11/2026','al contado','7,080.00','150 cajas'])assert.ok(m.includes(texto),`No se encontró ${texto}`);
  assert.equal(resumen({...q,estado:'BORRADOR'}),'');
});

test('la cotización de 360 cajas distingue reservas de producción condicionada',()=>{
  const f=chat.match(/function resumenPedidoConversado\(q\)\{[\s\S]*?\n\}/);
  assert.ok(f);
  const resumen=new Function('nombres','fecha',f[0]+';return resumenPedidoConversado;')(
    {'PRD-001':'leche UHT','PRD-002':'leche evaporada','PRD-003':'leche fresca'},x=>x
  );
  const q={estado:'CONFIRMADA',items:[{cantidad:180,producto_nombre:'UHT'},{cantidad:60,producto_nombre:'Evaporada'},{cantidad:120,producto_nombre:'Fresca'}],
    entregas:[{cajas:180,id_producto:'PRD-001',origen:'STOCK',fecha:'2026-11-16'},
      {cajas:40,id_producto:'PRD-002',origen:'STOCK',fecha:'2026-11-16'},
      {cajas:120,id_producto:'PRD-003',origen:'STOCK',fecha:'2026-11-16'},
      {cajas:20,id_producto:'PRD-002',origen:'PRODUCCION',fecha:'2026-11-17'}],
    forma_pago:'CONTADO',descuento_pct:8,calculo:{total:23579.23}};
  const m=resumen(q);
  for(const texto of ['360 cajas','340 cajas','23,579.23','condicional a producción y QM'])assert.ok(m.includes(texto),`Falta ${texto}`);
});
