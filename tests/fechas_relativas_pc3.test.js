import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ejecutarEnEscenarioPC3,fechaCortePC3,primeraEntregaPC3,segundaEntregaPC3,fechasEscenarioPC3,sqlAjusteFechasPC3} from '../lib/escenario.js';
import {fechaLimaHoy,fechaPrimeraEntrega,repartoSugerido} from '../lib/rules.js';
import {fechaLarga} from '../lib/formato.js';
import {explicarStockDeCotizacion} from '../lib/respuesta-stock.js';

const leer=ruta=>readFileSync(new URL(ruta,import.meta.url),'utf8');
const diaSemana=iso=>new Date(iso+'T12:00:00Z').getUTCDay();

test('El caso PC3 toma sus fechas del día de la sesión: parada hoy y entregas en días hábiles',async()=>{
  // 19/11/2026 es jueves: +3 cae en domingo, así que la primera entrega pasa al lunes 23 y el faltante al martes 24.
  await ejecutarEnEscenarioPC3(true,async()=>{
    assert.equal(fechaCortePC3(),'2026-11-19');
    assert.equal(fechaLimaHoy(),'2026-11-19');
    assert.equal(primeraEntregaPC3(),'2026-11-23');
    assert.equal(segundaEntregaPC3(),'2026-11-24');
    assert.equal(fechaPrimeraEntrega(),'2026-11-23');
    const x=repartoSugerido(60,40,20,'2026-11-24');
    assert.equal(x.fecha1,'2026-11-23');assert.equal(x.fecha2,'2026-11-24');assert.equal(x.sin_cobertura,0);
  },'2026-11-19');
});
test('Las entregas del caso nunca caen en sábado ni domingo, sea cual sea el día de corte',()=>{
  for(let dia=0;dia<60;dia++){
    const corte=new Date(Date.UTC(2026,10,1+dia,12)).toISOString().slice(0,10);
    const f=fechasEscenarioPC3(corte);
    for(const clave of ['primera','segunda','uhtProd','uhtDisp'])assert.ok(![0,6].includes(diaSemana(f[clave])),`${corte}: ${clave}=${f[clave]}`);
    assert.ok(f.primera>corte&&f.segunda>f.primera);
  }
});
test('Cambio de mes: las fechas relativas siguen siendo correctas',()=>{
  const f=fechasEscenarioPC3('2026-11-28');
  assert.equal(f.primera,'2026-12-01');assert.equal(f.segunda,'2026-12-02');
});
test('Con la fecha del informe (13/11) se obtienen exactamente 16, 17, 18, 19 y 12-01',async()=>{
  assert.deepEqual(fechasEscenarioPC3('2026-11-13'),{corte:'2026-11-13',primera:'2026-11-16',segunda:'2026-11-17',uhtProd:'2026-11-18',uhtDisp:'2026-11-19',frescaVence:'2026-12-01'});
  await ejecutarEnEscenarioPC3(true,async()=>{
    assert.equal(fechaCortePC3(),'2026-11-13');assert.equal(primeraEntregaPC3(),'2026-11-16');assert.equal(segundaEntregaPC3(),'2026-11-17');
  });
});
test('El ajuste de fechas se aplica desde la app, una vez por sesión y solo a la copia de esa sesión',()=>{
  const esquema='demo_'+'a1b2c3d4'.repeat(4);
  const sql=sqlAjusteFechasPC3(esquema,'2026-11-19');
  assert.match(sql,new RegExp(`"${esquema}"\\.plan_produccion`));
  assert.ok(sql.includes("DATE '2026-11-23'")&&sql.includes("DATE '2026-11-24'"));
  assert.ok(sql.includes("WHERE fecha=DATE '2026-11-13'"),'solo se desplaza una sesión que todavía tiene la fecha del informe');
  assert.ok(!/public\./.test(sql)&&!/TRUNCATE|DELETE|DROP/i.test(sql));
  assert.throws(()=>sqlAjusteFechasPC3('public; DROP TABLE x','2026-11-19'));
  assert.throws(()=>sqlAjusteFechasPC3(esquema,"2026-11-19'; --"));
  const db=leer('../lib/db.js');
  assert.match(db,/sqlAjusteFechasPC3\(sc,fechaLimaHoy\(\)\)/);
});
test('El SQL de instalación no cambia: conserva las fechas del informe como punto de partida',()=>{
  const sql=leer('../sql/05_escenario_pc3_360.sql');
  assert.ok(sql.includes("DATE '2026-11-13'")&&sql.includes("DATE '2026-11-17'"));
});
test('Las fechas se muestran al cliente en lenguaje natural',()=>{
  assert.equal(fechaLarga('2026-11-17'),'17 de noviembre');
  assert.equal(fechaLarga('2026-12-01T00:00:00.000Z'),'1 de diciembre');
  assert.equal(fechaLarga(null),'');
});
test('Los mensajes al cliente no muestran códigos de producto ni jerga interna',()=>{
  const chat=leer('../api/chat.js');
  const stock=explicarStockDeCotizacion({items:[{id_producto:'PRD-002',producto_nombre:'Leche Evaporada',cantidad:60,disponibilidad:{disponibles:40,planificadas:20,planes:[{libres:20,fecha_disponibilidad:'2026-11-17'}]}}],entregas:[]});
  assert.doesNotMatch(stock,/PRD-\d|ERP|\bQM\b|2026-\d\d-\d\d/);
  assert.match(stock,/17 de noviembre/);
  for(const cadena of ['Consulté el ERP','condicional a producción y QM','validación logística','Planeamiento?'])assert.ok(!chat.includes(cadena),`Queda texto técnico: ${cadena}`);
});
test('La explicación del mantenimiento funciona también con el pedido ya cerrado',()=>{
  const chat=leer('../api/chat.js');
  const mantenimiento=chat.indexOf('} else if(preguntaMantenimiento){');
  const cerrado=chat.indexOf('} else if(cerrado && !precios){');
  assert.ok(mantenimiento>0&&cerrado>0&&mantenimiento<cerrado);
});
test('En el modo PC3 hay un botón que inicia el caso con un solo clic',()=>{
  const ui=leer('../public/app.js');
  assert.match(ui,/Iniciar caso PC3/);
  assert.doesNotMatch(ui,/\['▶ Iniciar caso PC3/,'el botón vive solo en el recuadro del escenario, no repetido en las sugerencias del chat');
  assert.match(ui,/data-chat-suggest="Quiero preparar el caso PC3 del informe"/);
});
