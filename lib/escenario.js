// El reloj académico se usa SOLO dentro de las peticiones de ?escenario=pc3.
// Una petición normal nunca hereda el modo de otra sesión.
import {AsyncLocalStorage} from 'node:async_hooks';
const contexto = new AsyncLocalStorage();
export function ejecutarEnEscenarioPC3(activo,funcion){return contexto.run(activo===true,funcion);}
export function esEscenarioPC3(){return contexto.getStore()===true;}
export const FECHA_CORTE_PC3 = '2026-11-13';
export const PRIMERA_ENTREGA_PC3 = '2026-11-16';
export const SEGUNDA_ENTREGA_PC3 = '2026-11-17';
