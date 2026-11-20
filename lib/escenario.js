// El reloj académico se usa SOLO dentro de las peticiones de ?escenario=pc3.
// Una petición normal nunca hereda el modo de otra sesión.
// La fecha de corte ("hoy" del caso) se guarda por sesión al crearla (ver corteSimulacionPC3); todas las demás fechas
// del caso son relativas a ella y siempre caen en día hábil y no feriado: la parada de la cerradora es el día de corte,
// la primera entrega es 3 días después y la del faltante, el día hábil siguiente (en el informe: 13, 16 y 17 de noviembre de 2026).
import {AsyncLocalStorage} from 'node:async_hooks';
const contexto = new AsyncLocalStorage();
export const CORTE_PC3_PREDETERMINADO = '2026-11-13';
export function ejecutarEnEscenarioPC3(activo,funcion,corte=CORTE_PC3_PREDETERMINADO){return contexto.run(activo===true?{corte}:null,funcion);}
export function esEscenarioPC3(){return !!contexto.getStore();}
function sumar(iso,dias){const d=new Date(iso+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+dias);return d.toISOString().slice(0,10);}
// Feriados nacionales del Perú y los días que se evitan en la demostración (24 y 31 de diciembre suelen ser no laborables):
// que el docente no vea una entrega «el 25/12» y pregunte por ella.
const FECHAS_A_EVITAR=['01-01','05-01','06-07','06-29','07-23','07-28','07-29','08-06','08-30','10-08','11-01','12-08','12-09','12-24','12-25','12-31'];
function pascua(anio){
  const a=anio%19,b=Math.floor(anio/100),c=anio%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3);
  const h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451);
  const mes=Math.floor((h+l-7*m+114)/31),dia=((h+l-7*m+114)%31)+1;
  return `${anio}-${String(mes).padStart(2,'0')}-${String(dia).padStart(2,'0')}`;
}
export function esFeriadoPE(iso){
  if(FECHAS_A_EVITAR.includes(iso.slice(5)))return true;
  const santa=pascua(Number(iso.slice(0,4)));
  return iso===sumar(santa,-3)||iso===sumar(santa,-2);   // Jueves y Viernes Santo
}
function diaHabil(iso){
  let f=iso;
  for(;;){const dia=new Date(f+'T12:00:00Z').getUTCDay();if(dia!==0&&dia!==6&&!esFeriadoPE(f))return f;f=sumar(f,1);}
}
// Día en que «ocurre» la simulación (parada de la cerradora): el primer VIERNES hábil desde el día 10 del mes SIGUIENTE al real.
// Así las fechas siempre están por delante, lejos de feriados y fines de semana, sea cual sea el día de la exposición, y el caso
// conserva la forma del informe: parada un viernes, primera entrega el lunes y faltante el martes (13, 16 y 17 de noviembre de 2026).
export function corteSimulacionPC3(hoyReal){
  const [anio,mes]=hoyReal.split('-').map(Number);
  const siguiente=mes===12?`${anio+1}-01`:`${anio}-${String(mes+1).padStart(2,'0')}`;
  let f=`${siguiente}-10`;
  while(new Date(f+'T12:00:00Z').getUTCDay()!==5||esFeriadoPE(f))f=sumar(f,1);
  return f;
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
