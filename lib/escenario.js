// El reloj académico se usa SOLO dentro de las peticiones de ?escenario=pc3.
// Una petición normal nunca hereda el modo de otra sesión.
// La fecha de corte ("hoy" del caso) se guarda por sesión al crearla; todas las demás fechas del caso
// son relativas a ella: la parada de la cerradora es el día de corte, la primera entrega es +3 días y la del faltante +4.
import {AsyncLocalStorage} from 'node:async_hooks';
const contexto = new AsyncLocalStorage();
export const CORTE_PC3_PREDETERMINADO = '2026-11-13';
export function ejecutarEnEscenarioPC3(activo,funcion,corte=CORTE_PC3_PREDETERMINADO){return contexto.run(activo===true?{corte}:null,funcion);}
export function esEscenarioPC3(){return !!contexto.getStore();}
function sumar(iso,dias){const d=new Date(iso+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+dias);return d.toISOString().slice(0,10);}
export function fechaCortePC3(){return contexto.getStore()?.corte||CORTE_PC3_PREDETERMINADO;}
export function primeraEntregaPC3(){return sumar(fechaCortePC3(),3);}
export function segundaEntregaPC3(){return sumar(fechaCortePC3(),4);}
