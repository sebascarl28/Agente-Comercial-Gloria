import {fechaEscrita} from './ai.js';
import {normalizar} from './dialogo.js';

const etiquetas={'PRD-001':/\b(?:uht|entera)\b/,'PRD-002':/\bevaporad\w*\b/,'PRD-003':/\bfresc\w*\b/};

// Las fechas pertenecen a cada producto, no al primer nombre de leche de la frase.
// Solo se devuelve un reparto si se puede asociar una fecha inequívoca a cada línea.
export function repartoPorProducto(texto,q,hoy){
  if(!q?.items?.length || q.items.length<2)return null;
  const m=normalizar(texto);
  if(!/\b(?:recib\w*|entreg\w*|despach\w*|fecha|separad\w*|por partes|para|den|dame|mand\w*)\b/.test(m))return null;
  const partes=m.split(/\s+(?:y|ademas|mientras que)\s+|[;,]/).map(x=>x.trim());
  const propuestas=[],sinNombre=[];
  for(const parte of partes){
    const ids=Object.entries(etiquetas).filter(([,exp])=>exp.test(parte)).map(([id])=>id);
    const f=fechaEscrita(parte,hoy);
    if(f&&ids.length===1)propuestas.push({id_producto:ids[0],fecha:f});
    else if(f&&ids.length===0){
      const cajas=Number(parte.match(/\b(\d{1,5})\s*cajas?\b/)?.[1]);
      if(cajas>0)sinNombre.push({cajas,fecha:f});
    }
  }
  // Solo inferir «10 cajas de leche para mañana» si la otra variedad tiene
  // exactamente 10 cajas y las demás variedades ya están identificadas.
  if(sinNombre.length===1 && propuestas.length===q.items.length-1){
    const restantes=q.items.filter(x=>!propuestas.some(p=>p.id_producto===x.id_producto) && Number(x.cantidad)===sinNombre[0].cajas);
    if(restantes.length===1)propuestas.push({id_producto:restantes[0].id_producto,fecha:sinNombre[0].fecha});
  }
  if(new Set(propuestas.map(x=>x.id_producto)).size!==q.items.length)return null;
  if(!q.items.every(x=>propuestas.some(p=>p.id_producto===x.id_producto)))return null;
  return q.items.map(x=>({id_producto:x.id_producto,cajas:Number(x.cantidad),fecha:propuestas.find(p=>p.id_producto===x.id_producto).fecha}));
}

export function fechasParcialesPorProducto(texto,q,hoy){
  if(!q?.items?.length || q.items.length<2)return [];
  return normalizar(texto).split(/\s+(?:y|ademas|mientras que)\s+|[;,]/)
    .map(parte=>{
      const ids=Object.entries(etiquetas).filter(([,exp])=>exp.test(parte)).map(([id])=>id);
      const f=fechaEscrita(parte,hoy);
      return ids.length===1 && f && q.items.some(x=>x.id_producto===ids[0])?{id_producto:ids[0],fecha:f}:null;
    }).filter(Boolean);
}

export function pideReparto(texto){
  const m=normalizar(texto);
  return /\b(?:recib\w*|entreg\w*|despach\w*|fecha|separad\w*|por partes)\b/.test(m) ||
    (/\b(?:den|dame|mand\w*)\b/.test(m) && /\b(?:manana|semana|lunes|martes|miercoles|jueves|viernes|sabado|domingo)\b/.test(m)) ||
    (/(?:\bpara\s+(?:el\s+)?(?:manana|pasado manana|lunes|martes|miercoles|jueves|viernes|sabado|domingo)\b)/.test(m) && /\b(?:y|ademas)\b/.test(m));
}

// El cambio de cajas se interpreta por separado de las condiciones de entrega
// y del descuento. No aplicar automáticamente un cambio dudoso.
export function separarSolicitudMixta(texto,q){
  if(!q?.items?.length)return null;
  const m=normalizar(texto);
  if(!/\b(?:agreg\w*|sum\w*|aument\w*|anad\w*)\b/.test(m) || !/\b\d{1,5}\s*cajas?\b/.test(m))return null;
  const primer=String(texto).split(/\b(?:luego|despues|y\s+(?:para|quiero que|pedir|solicitar|un descuento|descuento))\b/i)[0];
  if(!/\b\d{1,5}\s*cajas?\b/i.test(primer))return null;
  return {cantidadTexto:primer,entregaTexto:/\b(?:entreg\w*|recib\w*|despach\w*|fecha)\b/.test(m)?texto:null};
}
