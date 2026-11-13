// Abrir otra negociación no modifica ni elimina el pedido anterior.
const normalizar=t=>String(t||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
export function pideNuevaCotizacion(texto,q){
 const m=normalizar(texto);
 if(/\b(?:no quiero|no deseo|no necesito|cancelar|cancel[aá])\b/.test(m))return false;
 const nueva=/\b(?:otra|nueva)\s+cotizacion\b|\bcotizacion\s+(?:nueva|aparte)\b|\b(?:otro|nuevo)\s+pedido\b/.test(m);
 if(nueva && !/\b(?:como va|estado de|ver|consultar)\b/.test(m))return true;
 if(q?.estado!=='CONFIRMADA')return false;
 return /\b(?:anadir|agregar|incluye|incluir|tambien quiero|ademas quiero)\b/.test(m)
   || /\b(?:quiero|necesito|deseo|quisiera)\s+(?:pedir|comprar|cotizar|\d+\s+cajas?)/.test(m);
}
export function preguntaLimiteDescuento(texto){
 const m=normalizar(texto);
 if(!/\b(?:maximo|maxima|limite)\b/.test(m) && /\b(?:total|sale|cuesta|pago|tengo|aplicado|aprobado|autorizado|ofrecido|mi descuento)\b/.test(m))return false;
 return /\b(?:descuentos?|dscuentos?|descueto|descuent|rebaja|porcentaje)\b/.test(m)
   && /\b(?:maximo|maxima|limite|hasta|cuanto|cuanta|que porcentaje)\b/.test(m);
}
