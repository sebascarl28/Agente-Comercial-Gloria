import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ejecutarEnEscenarioPC3,fechaCortePC3,primeraEntregaPC3,segundaEntregaPC3} from '../lib/escenario.js';
import {fechaLimaHoy,fechaPrimeraEntrega,repartoSugerido} from '../lib/rules.js';
import {fechaLarga} from '../lib/formato.js';
import {explicarStockDeCotizacion} from '../lib/respuesta-stock.js';

const leer=ruta=>readFileSync(new URL(ruta,import.meta.url),'utf8');

test('El caso PC3 toma sus fechas del día de la sesión: parada hoy, entrega +3 y faltante +4',async()=>{
  await ejecutarEnEscenarioPC3(true,async()=>{
    assert.equal(fechaCortePC3(),'2026-11-19');
    assert.equal(fechaLimaHoy(),'2026-11-19');
    assert.equal(primeraEntregaPC3(),'2026-11-22');
    assert.equal(segundaEntregaPC3(),'2026-11-23');
    assert.equal(fechaPrimeraEntrega(),'2026-11-22');
    const x=repartoSugerido(60,40,20,'2026-11-23');
    assert.equal(x.fecha1,'2026-11-22');assert.equal(x.fecha2,'2026-11-23');assert.equal(x.sin_cobertura,0);
  },'2026-11-19');
});
test('Cambio de mes: las fechas relativas siguen siendo correctas',async()=>{
  await ejecutarEnEscenarioPC3(true,async()=>{
    assert.equal(primeraEntregaPC3(),'2026-12-01');assert.equal(segundaEntregaPC3(),'2026-12-02');
  },'2026-11-28');
});
test('Sin fecha indicada se conserva el caso del informe (13, 16 y 17 de noviembre)',async()=>{
  await ejecutarEnEscenarioPC3(true,async()=>{
    assert.equal(fechaCortePC3(),'2026-11-13');assert.equal(primeraEntregaPC3(),'2026-11-16');assert.equal(segundaEntregaPC3(),'2026-11-17');
  });
});
test('El SQL del caso guarda fechas relativas al día de creación de la sesión',()=>{
  const sql=leer('../sql/05_escenario_pc3_360.sql');
  assert.match(sql,/America\/Lima/);
  assert.doesNotMatch(sql,/DATE '2026-/);
  for(const parte of ['v_d+3','v_d+4','v_d+5','v_d+6','v_d+18'])assert.ok(sql.includes(parte),`Falta ${parte}`);
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
  const mantenimiento=chat.indexOf('}else if(preguntaMantenimiento){')>0?chat.indexOf('}else if(preguntaMantenimiento){'):chat.indexOf('} else if(preguntaMantenimiento){');
  const cerrado=chat.indexOf('} else if(cerrado && !precios){');
  assert.ok(mantenimiento>0&&cerrado>0&&mantenimiento<cerrado);
});
