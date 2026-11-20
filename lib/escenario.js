// El reloj académico se usa SOLO dentro de las peticiones de ?escenario=pc3.
// Una petición normal nunca hereda el modo de otra sesión.
// La fecha de corte ("hoy" del caso) se guarda por sesión al crearla; todas las demás fechas del caso
// son relativas a ella y siempre caen en día hábil: la parada de la cerradora es el día de corte, la primera entrega
// es 3 días después y la del faltante, el día hábil siguiente (en el informe: 13, 16 y 17 de noviembre de 2026).
import {AsyncLocalStorage} from 'node:async_hooks';
const contexto = new AsyncLocalStorage();
export const CORTE_PC3_PREDETERMINADO = '2026-11-13';
export function ejecutarEnEscenarioPC3(activo,funcion,corte=CORTE_PC3_PREDETERMINADO){return contexto.run(activo===true?{corte}:null,funcion);}
export function esEscenarioPC3(){return !!contexto.getStore();}
function sumar(iso,dias){const d=new Date(iso+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+dias);return d.toISOString().slice(0,10);}
function diaHabil(iso){
  let f=iso;
  for(;;){const dia=new Date(f+'T12:00:00Z').getUTCDay();if(dia!==0&&dia!==6)return f;f=sumar(f,1);}
}
export function fechasEscenarioPC3(corte=CORTE_PC3_PREDETERMINADO){
  const primera=diaHabil(sumar(corte,3)),segunda=diaHabil(sumar(primera,1));
  const uhtProd=diaHabil(sumar(segunda,1)),uhtDisp=diaHabil(sumar(uhtProd,1));
  return {corte,primera,segunda,uhtProd,uhtDisp,frescaVence:sumar(primera,15)};
}
export function fechaCortePC3(){return contexto.getStore()?.corte||CORTE_PC3_PREDETERMINADO;}
export function primeraEntregaPC3(){return fechasEscenarioPC3(fechaCortePC3()).primera;}
export function segundaEntregaPC3(){return fechasEscenarioPC3(fechaCortePC3()).segunda;}
// sql/05 crea cada sesión con las fechas del informe (13/11). Esta sentencia las desplaza al día de hoy,
// una sola vez por sesión y sin tocar nada más (se reconoce la sesión «sin ajustar» por su fecha de parada).
export function sqlAjusteFechasPC3(esquema,hoy){
  if(!/^demo_[0-9a-f]{32}$/.test(esquema)||!/^\d{4}-\d{2}-\d{2}$/.test(hoy))throw new Error('Parámetros de ajuste inválidos');
  const f=fechasEscenarioPC3(hoy),s=`"${esquema}"`;
  const sinAjustar=`EXISTS (SELECT 1 FROM ${s}.pc3_mantenimiento WHERE fecha=DATE '${CORTE_PC3_PREDETERMINADO}')`;
  return `UPDATE ${s}.plan_produccion SET
 fecha_produccion=CASE id_plan WHEN 'PPPI-UHT-01' THEN DATE '${f.uhtProd}' ELSE DATE '${f.primera}' END,
 fecha_disponibilidad=CASE id_plan WHEN 'PPPI-UHT-01' THEN DATE '${f.uhtDisp}' ELSE DATE '${f.segunda}' END
 WHERE id_plan IN ('PPPI-EVA-01','PPPI-UHT-01','PPPI-FRE-01') AND ${sinAjustar};
UPDATE ${s}.stock_lotes SET fecha_vencimiento=DATE '${f.frescaVence}' WHERE id_lote='LOT-FRE-01' AND ${sinAjustar};
UPDATE ${s}.pc3_mantenimiento SET fecha=DATE '${hoy}' WHERE fecha=DATE '${CORTE_PC3_PREDETERMINADO}';`;
}
