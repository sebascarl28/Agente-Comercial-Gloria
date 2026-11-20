import {fechaEscrita} from './ai.js';
import {normalizar} from './dialogo.js';

const etiquetas={'PRD-001':/\b(?:uht|entera)\b/,'PRD-002':/\bevaporad\w*\b/,'PRD-003':/\bfresc\w*\b/};

// Las fechas pertenecen a cada producto, no al primer nombre de leche de la frase.
// Solo se devuelve un reparto si se puede asociar una fecha inequívoca a cada línea.
export function repartoPorProducto(texto,q,hoy){
  if(!q?.items?.length || q.items.length<2)return null;
  const m=normalizar(texto);
  if(!/\b(?:recib\w*|entreg\w*|despach\w*|fecha|separad\w*|por partes|para)\b/.test(m))return null;
  const partes=m.split(/\s+(?:y|ademas|mientras que)\s+|[;,]/).map(x=>x.trim());
  const propuestas=[];
  for(const parte of partes){
    const ids=Object.entries(etiquetas).filter(([,exp])=>exp.test(parte)).map(([id])=>id);
    const f=fechaEscrita(parte,hoy);
    if(f&&ids.length===1)propuestas.push({id_producto:ids[0],fecha:f});
  }
  if(new Set(propuestas.map(x=>x.id_producto)).size!==q.items.length)return null;
  if(!q.items.every(x=>propuestas.some(p=>p.id_producto===x.id_producto)))return null;
  return q.items.map(x=>({id_producto:x.id_producto,cajas:Number(x.cantidad),fecha:propuestas.find(p=>p.id_producto===x.id_producto).fecha}));
}

export function pideReparto(texto){
  const m=normalizar(texto);
  return /\b(?:recib\w*|entreg\w*|despach\w*|fecha|separad\w*|por partes)\b/.test(m)
    && /\b(?:manana|semana|lunes|martes|miercoles|jueves|viernes|sabado|domingo|\d{1,2}[/-]\d{1,2})\b/.test(m);
}
