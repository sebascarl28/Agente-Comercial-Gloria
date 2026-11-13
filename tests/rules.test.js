import test from 'node:test';
import assert from 'node:assert/strict';
import {cotizar,descuentoPermitido,repartoSugerido,fechaValida,sumarDias,MAX_DESCUENTO_AGENTE,MAX_DESCUENTO_JEFATURA} from '../lib/rules.js';

test('La Alameda: 300 UHT sin descuento',()=>{
  const x=cotizar(60,46,300,0);
  assert.equal(x.subtotal,18000);assert.equal(x.igv,3240);assert.equal(x.total,21240);
});
test('La Alameda: cotización con 5% y 8%',()=>{
  assert.equal(cotizar(60,46,300,5).total,20178);
  assert.equal(cotizar(60,46,300,8).total,19540.8);
  assert.equal(descuentoPermitido(60,46,15,8),true);
  assert.equal(descuentoPermitido(60,46,15,12),false); // tope ≠ aprobación automática
  assert.equal(descuentoPermitido(58,43,15,12),true);
});
test('Las reglas de autorización siguen separadas',()=>{
  assert.equal(MAX_DESCUENTO_AGENTE,5);assert.equal(MAX_DESCUENTO_JEFATURA,12);
});
test('Faltante se detecta y la producción solo cubre la diferencia',()=>{
  const x=repartoSugerido(300,250,50,'2026-11-19','2026-11-13');
  assert.deepEqual([x.inmediato,x.faltante,x.futuro,x.sin_cobertura],[250,50,50,0]);
  assert.equal(x.fecha2,'2026-11-19');
  assert.equal(x.cubierto,true);
});
test('Una orden sin producción suficiente sigue siendo excepción',()=>{
  const x=repartoSugerido(400,250,50,'2026-11-19','2026-11-13');
  assert.equal(x.sin_cobertura,100);assert.equal(x.cubierto,false);
});
test('Fechas y cantidades inválidas no se aceptan',()=>{
  assert.equal(fechaValida('2026-11-19'),true);
  assert.equal(fechaValida('futuro'),false);
  assert.equal(sumarDias('2026-11-13',6),'2026-11-19');
  assert.throws(()=>cotizar(60,46,-1,8));
  assert.throws(()=>cotizar(60,46,300,101));
});
