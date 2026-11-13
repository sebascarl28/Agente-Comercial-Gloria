// Estado comercial VERIFICADO. Groq nunca decide aprobaciones ni inventario.
const formatSoles = v => `S/ ${Number(v || 0).toFixed(2)}`;
export const pendientesDescuento = q => (q?.aprobaciones || []).find(x => ['PENDIENTE_JEFATURA', 'OFERTADO'].includes(x.estado)) || null;
export const creditoInsuficiente = q => q?.forma_pago === 'CREDITO' && Number(q.linea_credito) - Number(q.deuda_vigente) < Number(q.total);
export function listaPendientes(q) {
  if (!q || q.estado === 'CONFIRMADA') return [];
  const falta=[];
  if (pendientesDescuento(q)) falta.push('aprobar y aceptar el descuento');
  if (!Array.isArray(q.entregas) || !q.entregas.length) falta.push('acordar las fechas de entrega');
  else if (!q.entrega_aceptada) falta.push('aceptar la propuesta de entregas');
  if (!q.forma_pago || q.forma_pago === 'SIN_DEFINIR') falta.push('elegir la forma de pago');
  else if (creditoInsuficiente(q)) falta.push('resolver el crédito con Finanzas');
  if (!q.direccion_confirmada) falta.push('confirmar la dirección de entrega');
  return falta;
}
export function resumenHabilitado(q) {
  return !!q && (q.estado === 'CONFIRMADA' || listaPendientes(q).length === 0);
}
export function siguientePaso(q) {
  if (!q) return '¿Qué tipo de leche y cuántas cajas necesitas?';
  if (q.estado === 'CONFIRMADA') return 'Tu pedido ya figura registrado en esta simulación. Puedes consultarlo en Pedidos.';
  const ap=pendientesDescuento(q);
  if (ap?.estado === 'PENDIENTE_JEFATURA') return `El descuento solicitado de ${ap.solicitado_pct}% está pendiente de Jefatura Comercial. Puedes revisar su decisión desde la pestaña correspondiente; todavía no confirmaremos el pedido.`;
  if (ap?.estado === 'OFERTADO') return `Jefatura autorizó ofrecer ${ap.ofrecido_pct}%. ¿Aceptas ese descuento o deseas seguir negociando?`;
  if (!q.entregas?.length) return '¿Para qué fecha deseas recibir las cajas? Consultaré el stock y el plan de producción para evaluar si podemos cumplirla.';
  if (!q.entrega_aceptada) {
    const partes=q.entregas.map(x=>`${x.cajas} cajas el ${String(x.fecha).slice(0,10)}`).join(' y ');
    return `La propuesta de entrega es: ${partes}. Son fechas sujetas a la validación de despacho y, si corresponde, Calidad. ¿Aceptas esa propuesta?`;
  }
  if (!q.forma_pago || q.forma_pago === 'SIN_DEFINIR') return '¿Prefieres pagar al contado, con el crédito aprobado de La Alameda o con un anticipo del 40% y saldo del 60% (opción académica)?';
  if (creditoInsuficiente(q)) return `El saldo de crédito disponible es ${formatSoles(Number(q.linea_credito)-Number(q.deuda_vigente))}, pero esta cotización asciende a ${formatSoles(q.total)}. Finanzas tendría que evaluar una ampliación o podemos elegir otra forma de pago.`;
  if (!q.direccion_confirmada) return `¿Confirmas que la entrega se realizará en ${q.direccion || 'la dirección registrada'}, ${q.distrito || 'Lima'}? Si deseas otra dirección, indícame cuál.`;
  return 'Ya acordamos producto, cantidades, descuento, pago, dirección y propuesta de entregas. Te muestro abajo el resumen final. ¿Confirmas el pedido con esas condiciones?';
}
export function estadoComercial({q,contexto,tema='general'}) {
  const c=contexto?.cliente;
  if(tema==='credito') {
    const ult=contexto?.creditos?.[0];
    const linea=c?`${formatSoles(c.linea_credito)} a ${c.plazo_credito_dias || 0} días`:'sin información';
    if(!ult) return `La línea de crédito registrada es ${linea}. No veo una solicitud nueva de Finanzas en esta simulación.`;
    const e=ult.estado;
    if(e==='PENDIENTE_FINANZAS')return `Tu solicitud de crédito por ${formatSoles(ult.monto_solicitado)} está pendiente de evaluación por Finanzas. La línea actual sigue siendo ${linea}.`;
    if(e==='OFERTADO')return `Finanzas ofrece una línea de ${formatSoles(ult.monto_ofrecido)} a ${ult.plazo_ofrecido} días. Aún falta tu aceptación; la línea actual sigue siendo ${linea}.`;
    if(e==='ACEPTADA_CLIENTE')return `La oferta de Finanzas fue aceptada por el cliente. La línea vigente es ${linea}.`;
    return `La última solicitud de crédito figura como ${e.replaceAll('_',' ').toLowerCase()}. La línea vigente es ${linea}.`;
  }
  if(!q) {
    if(tema==='pedido') return contexto?.pedidos?.length?'Hay pedidos registrados en la pestaña Pedidos; selecciona uno para revisarlo.':'Aún no hay un pedido confirmado en esta simulación.';
    return 'Todavía no tenemos una cotización activa en esta atención. ¿Qué leche y cuántas cajas deseas cotizar?';
  }
  if(tema==='descuento') {
    const s=q.aprobaciones?.[0];
    if(!s)return `La cotización V${q.version} tiene ${q.descuento_pct}% de descuento aplicado. No existe solicitud especial a Jefatura para esta cotización.`;
    if(s.estado==='PENDIENTE_JEFATURA')return `Tu solicitud del ${s.solicitado_pct}% está pendiente de Jefatura Comercial; aún no se ha autorizado ese porcentaje.`;
    if(s.estado==='OFERTADO')return `Jefatura autorizó ofrecer ${s.ofrecido_pct}% de descuento, pero todavía falta que tú lo aceptes.`;
    if(s.estado==='ACEPTADA_CLIENTE')return `Jefatura autorizó ${s.ofrecido_pct}% y tú aceptaste la oferta. La cotización V${q.version} tiene aplicado ${q.descuento_pct}%.`;
    if(s.estado==='RECHAZADA_JEFATURA')return `Jefatura rechazó la solicitud del ${s.solicitado_pct}%. Podemos continuar con otra propuesta, respetando los márgenes.`;
    if(s.estado==='RECHAZADA_CLIENTE')return `Rechazaste la oferta de ${s.ofrecido_pct}%. Puedes solicitar otra propuesta.`;
    return `La última solicitud de descuento está ${s.estado.replaceAll('_',' ').toLowerCase()}; el descuento aplicado actualmente es ${q.descuento_pct}%.`;
  }
  if(tema==='entrega'){
    if(!q.entregas?.length)return `Aún no hay fechas propuestas para la cotización V${q.version}. ¿Para qué día las necesitas?`;
    return `La entrega propuesta es ${q.entregas.map(x=>`${x.cajas} cajas el ${String(x.fecha).slice(0,10)}`).join(' y ')}. Estado: ${q.entrega_aceptada?'aceptada por el cliente, sujeta a revalidación logística y Calidad':'pendiente de tu aceptación'}.`;
  }
  if(tema==='pedido') {
    const p=contexto?.pedidos?.find(x=>x.id_cotizacion===q.id_cotizacion);
    return p?`El pedido figura como ${p.estado.replaceAll('_',' ').toLowerCase()} en la simulación. Las entregas provenientes de producción siguen sujetas a Calidad y despacho.`:`La cotización V${q.version} todavía no se ha convertido en pedido. ${siguientePaso(q)}`;
  }
  const status=q.estado==='CONFIRMADA'?'confirmada':listaPendientes(q).length?'en negociación':'lista para confirmar';
  return `Tu cotización V${q.version} es por ${q.cantidad} cajas de ${q.producto_nombre}, con ${q.descuento_pct}% de descuento y un total de ${formatSoles(q.total)} incluido IGV. Estado: ${status}. ${siguientePaso(q)}`;
}

// Identificador de las condiciones que el cliente vio al final de la negociación.
// Se recalcula al confirmar: una entrega, cantidad, descuento, dirección o pago
// modificados invalidan cualquier "sí" pronunciado anteriormente.
export function firmaCondiciones(q) {
  if(!q) return null;
  return JSON.stringify({
    id:q.id_cotizacion,version:Number(q.version),producto:q.id_producto,
    cantidad:Number(q.cantidad),descuento:Number(q.descuento_pct),
    pago:q.forma_pago,direccion:q.id_direccion,direccion_confirmada:!!q.direccion_confirmada,
    entrega_aceptada:!!q.entrega_aceptada,
    entregas:(q.entregas||[]).map(e=>({cajas:Number(e.cajas),fecha:String(e.fecha).slice(0,10),origen:e.origen})),
    total:Number(q.total)
  });
}
export function confirmacionVigente(q, estado) {
  return !!q && q.estado!=='CONFIRMADA' && resumenHabilitado(q)
    && estado?.confirmacion_final?.id===q.id_cotizacion
    && estado.confirmacion_final.firma===firmaCondiciones(q);
}
