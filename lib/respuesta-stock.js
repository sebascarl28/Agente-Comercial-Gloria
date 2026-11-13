// Responde consultas de disponibilidad sin perder una cotización ya iniciada.
// No confirma stock ni compromete logística: muestra cobertura actual del ERP simulado.
const nombres={'PRD-001':'leche UHT','PRD-002':'leche evaporada','PRD-003':'leche fresca'};
const numero=x=>Math.max(0,Number(x)||0);
const fecha=x=>!x?'':String(x).slice(0,10).split('-').reverse().join('/');
export function explicarStockDeCotizacion(q,productoSolicitado=null) {
  const items=Array.isArray(q?.items)?q.items:[];
  if(!items.length)return null;
  const seleccionados=productoSolicitado?items.filter(x=>x.id_producto===productoSolicitado):items;
  if(!seleccionados.length)return `Ese producto todavía no está en la cotización. Ahora tenemos ${items.map(x=>nombres[x.id_producto]||x.producto_nombre).join(', ')} anotadas. ¿Deseas consultar otra variedad?`;
  const total=items.reduce((n,x)=>n+numero(x.cantidad),0);
  const apertura=items.length>1?`Claro. Tu cotización actual es de ${total} cajas y no voy a cambiarla. Según el ERP simulado:\n`:
    `Claro, tu cotización actual es por ${total} cajas. Según el ERP simulado:\n`;
  const detalles=seleccionados.map(item=>{
    const disponibles=numero(item.disponibilidad?.disponibles);
    const solicitadas=numero(item.cantidad);
    const cubiertas=Math.min(disponibles,solicitadas);
    const futuras=Math.min(numero(item.disponibilidad?.planificadas),Math.max(0,solicitadas-cubiertas));
    const sinCobertura=Math.max(0,solicitadas-cubiertas-futuras);
    const nombre=nombres[item.id_producto]||item.producto_nombre||'leche';
    const fechas=(item.disponibilidad?.planes||[]).filter(x=>numero(x.libres)>0).sort((a,b)=>String(a.fecha_disponibilidad).localeCompare(String(b.fecha_disponibilidad)));
    const f=fechas.length?fecha(fechas[0].fecha_disponibilidad):'';
    let linea=`• ${nombre}: pediste ${solicitadas}; hay ${disponibles} cajas liberadas (${cubiertas} cubren tu solicitud)`;
    if(futuras>0)linea+=` y ${futuras} previstas en producción${f?` desde el ${f}`:''}, todavía sujetas a Calidad`;
    if(sinCobertura>0)linea+=`. Faltan ${sinCobertura} sin cobertura programada`;
    return linea+'.';
  }).join('\n');
  let cierre='';
  if(q.entregas?.length && !q.entrega_aceptada){
    const grupo=new Map();
    for(const e of q.entregas){
      const f=fecha(e.fecha);grupo.set(f,(grupo.get(f)||0)+numero(e.cajas));
    }
    cierre=`\n\nLa propuesta que tenemos pendiente es: ${[...grupo].map(([f,n])=>`${n} cajas para el ${f}`).join(' y ')}. Son fechas propuestas, no entregas confirmadas: faltan las validaciones de Calidad y logística. ¿Te parece bien ese reparto?`;
  }else if(q.entrega_aceptada){
    cierre='\n\nYa registramos tu aceptación de la propuesta de entrega. Podemos continuar con las condiciones comerciales.';
  }else cierre='\n\n¿Quieres que revisemos una propuesta de entrega para las cantidades que ya solicitaste?';
  return apertura+detalles+cierre;
}
