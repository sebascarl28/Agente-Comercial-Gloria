import {esEscenarioPC3,FECHA_CORTE_PC3,PRIMERA_ENTREGA_PC3} from './escenario.js';
// Reglas financieras y de disponibilidad: NO delegar estos cálculos al LLM.
export const IGV = 0.18;
export const MAX_DESCUENTO_AGENTE = 5;
export const MAX_DESCUENTO_JEFATURA = 12;

export const dinero = n => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
export function cotizar(precio, costo, cajas, descuentoPct = 0) {
  const p = Number(precio), c = Number(costo), q = Number(cajas), d = Number(descuentoPct);
  if (![p,c,q,d].every(Number.isFinite) || p <= 0 || c < 0 || !Number.isInteger(q) || q <= 0 || d < 0 || d > 100) {
    throw new Error('Los valores de cotización son inválidos.');
  }
  const unitario = p * (1 - d / 100);
  const subtotal = dinero(unitario * q);
  const igv = dinero(subtotal * IGV);
  const total = dinero(subtotal + igv);
  const margen = unitario > 0 ? dinero(((unitario - c) / unitario) * 100) : -100;
  return { precio_unitario: p, cajas: q, descuento_pct: d, subtotal, igv, total, margen_pct: margen };
}
export function descuentoPermitido(precio, costo, margenMinimo, descuento) {
  const x = cotizar(precio, costo, 1, descuento);
  return x.margen_pct + 0.00001 >= Number(margenMinimo);
}
export function fechaLimaHoy() {
  if(esEscenarioPC3()) return FECHA_CORTE_PC3;
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
export function sumarDias(iso, dias) {
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0,10);
}
export function fechaPrimeraEntrega(hoy=fechaLimaHoy()){return esEscenarioPC3()?PRIMERA_ENTREGA_PC3:sumarDias(hoy,1);}
export function fechaValida(iso) {
  if(typeof iso!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(iso))return false;
  const d=new Date(iso+'T12:00:00Z');
  return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===iso;
}
export function repartoSugerido(cajas, disponibles, produccion, fechaProduccion, hoy = fechaLimaHoy()) {
  const cantidad = Number(cajas), inmediato = Math.min(cantidad, Math.max(0, Number(disponibles)));
  const faltante = Math.max(0, cantidad - inmediato);
  const futuro = Math.min(faltante, Math.max(0, Number(produccion)));
  const fecha1 = fechaPrimeraEntrega(hoy); // propuesta académica, NO promesa logística
  const fecha2 = fechaProduccion || null;
  return { cantidad, inmediato, faltante, futuro, sin_cobertura: Math.max(0, faltante - futuro), fecha1, fecha2, cubierto: faltante <= futuro };
}
export function textoEstado(valor) { return String(valor || '').replaceAll('_',' '); }

// Retorna el día en el que se acumula producción programada suficiente.
export function fechaCobertura(planes=[],cantidad=0){
  const requeridas=Math.max(0,Number(cantidad)||0);
  if(!requeridas)return null;
  const orden=(planes||[]).filter(p=>Number(p.libres??p.cajas)>0)
    .sort((a,b)=>String(a.fecha_disponibilidad).localeCompare(String(b.fecha_disponibilidad)));
  let total=0,fecha=null;
  for(const p of orden){
    total+=Number(p.libres??p.cajas);
    const f=p.fecha_disponibilidad;
    fecha=typeof f==='string'?f.slice(0,10):new Date(f).toISOString().slice(0,10);
    if(total>=requeridas)break;
  }
  return fecha;
}
