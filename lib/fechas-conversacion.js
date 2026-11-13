import {sumarDias,fechaCobertura,fechaPrimeraEntrega} from './rules.js';

// Las fechas del botón son preferencias para consultar, no disponibilidad confirmada.
export function fechasProximaSemana(hoy){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(hoy||''))return [];
 const fecha=new Date(`${hoy}T12:00:00Z`);
 if(!Number.isFinite(fecha.getTime()))return [];
 const dias=(8-fecha.getUTCDay())%7||7;
 const lunes=sumarDias(hoy,dias);
 return [lunes,sumarDias(lunes,2),sumarDias(lunes,4)];
}
export function atenderFechaRelativa(turno,estado,cotizacion){
 // Cifras diferentes de la cotización requieren aclaración antes de tratarse como fecha.
 if(turno.cantidad && Number(turno.cantidad)!==Number(cotizacion?.cantidad)){
   estado.esperando='ACLARAR_FECHA_CANTIDAD';estado.periodo_pendiente=turno.periodo;
   return '¿Quieres modificar la cantidad de cajas o solo estás indicando cuándo deseas recibir el pedido? Dímelo para mantener correcta la cotización.';
 }
 estado.esperando='PEDIR_FECHA_EXACTA';
 estado.fecha_deseada=null;estado.confirmacion_final=null;
 estado.fechas_sugeridas=turno.periodo==='proxima_semana'?fechasProximaSemana(estado.hoy):[];
 if(turno.periodo==='proxima_semana')return 'Claro, la próxima semana. ¿Qué día prefieres? Cuando me indiques la fecha, revisaré la disponibilidad y logística antes de proponerte la entrega.';
 if(turno.periodo==='esta_semana')return 'Claro, esta semana. ¿Qué día prefieres? Revisaré la disponibilidad y logística antes de proponerte la entrega.';
 return 'Entiendo que lo necesitas pronto. ¿Qué fecha prefieres? Revisaré la disponibilidad y logística antes de proponerte la entrega.';
}

export function aclararFechaCantidad(texto,estado,cotizacion){
 if(estado.esperando!=='ACLARAR_FECHA_CANTIDAD')return null;
 const m=String(texto||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
 if(/^(?:solo |cambiar )?(?:la )?(?:fecha|entrega)[.!\s]*$/.test(m)||/^solo (?:la )?fecha/.test(m)){
   const periodo=estado.periodo_pendiente;delete estado.periodo_pendiente;
   return atenderFechaRelativa({periodo,cantidad:null},estado,cotizacion);
 }
 if(/\b(?:modificar|cambiar|ajustar)\b.*\b(?:cantidad|cajas|productos)\b/.test(m)){
   delete estado.periodo_pendiente;estado.esperando='MODIFICAR_LINEAS';
   return 'Claro. ¿Cuántas cajas quieres de cada leche? Puedes indicar ambas cantidades en un solo mensaje.';
 }
 return null;
}

// Fecha de referencia académica; nunca equivale a una promesa logística.
export function preguntaFechaDisponible(texto=''){
 const m=String(texto||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
 if(/\b(?:vencimiento|vence|caduca|vencer|descuento|credito|pago|direccion|precio)\b/.test(m))return false;
 return /\b(?:para )?cuando\b.*\b(?:disponib\w*|entreg\w*|lleg\w*|recib\w*)\b/.test(m)
   || /\b(?:que fecha|fecha mas proxima|primera fecha)\b.*\b(?:disponib\w*|entreg\w*|recib\w*)\b/.test(m)
   || /^(?:y\s+)?(?:la\s+)?fecha\s*[?!.]*$/.test(m);
}

export function fechaReferencialDeCotizacion(q,hoy){
 if(!q?.items?.length)return null;
 let fecha=fechaPrimeraEntrega(hoy);
 for(const item of q.items){
   const d=item.disponibilidad||{},faltan=Math.max(0,Number(item.cantidad)-Number(d.disponibles||0));
   if(!Number.isFinite(faltan))return null;
   if(faltan){
     const prevista=fechaCobertura(d.planes||[],faltan);
     if(!prevista)return null;
     if(prevista>fecha)fecha=prevista;
   }
 }
 return fecha;
}
export function responderFechaDisponible(q,estado){
 const fecha=fechaReferencialDeCotizacion(q,estado.hoy);
 if(!fecha)return 'Aún no hay cobertura suficiente en los datos disponibles para darte una fecha para todo el pedido. Debemos consultar Planeamiento.';
 estado.esperando='PEDIR_FECHA_EXACTA';estado.fechas_sugeridas=[fecha];estado.fecha_referencia={fecha,version:q.version};estado.confirmacion_final=null;
 const bonita=fecha.split('-').reverse().join('/');
 const pendiente=q.items.some(item=>Number(item.cantidad)>Number(item.disponibilidad?.disponibles||0));
 const condicion=pendiente?' Algunas cajas aún están en producción y podrán entregarse cuando se liberen; esa fecha es tentativa.':' La fecha aún debe confirmarse con despacho.';
 return `Como fecha de referencia, podríamos coordinar todas las cajas para el ${bonita}.${condicion} ¿Quieres que revise esa fecha o prefieres otra?`;
}
