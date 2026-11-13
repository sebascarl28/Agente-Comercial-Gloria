import {randomUUID} from 'node:crypto';
import {esEscenarioPC3,PRIMERA_ENTREGA_PC3,SEGUNDA_ENTREGA_PC3} from '../lib/escenario.js';
import {enSimulacion,consulta,uno} from '../lib/db.js';
import {respuesta,errorJson,revisarAcceso,metodo,falla,obligatorio} from '../lib/http.js';
import {interpretar} from '../lib/ai.js';
import {explicarStockDeCotizacion} from '../lib/respuesta-stock.js';
import {leerTurno,estadoAnterior,esAfirmacion,esNegacion,productoExplicito,esConfirmacionCorta,confirmaReduccion,esAceptacionDescuento,ultimaRespuestaPidePedido,ultimaRespuestaPideDescuento,esAceptacionEntrega,esAceptacionDireccion,mencionaRepartoConAceptacion,aceptaRepartoPropuesto,detectarProducto,pideAgregarProducto} from '../lib/dialogo.js';
import {contextoCliente,crearCotizacion,modificarCotizacion,detalleCotizacion,solicitarDescuento,proponerEntrega,confirmarDireccion,definirPago,confirmarPedido,clienteRespondeDescuento,clienteRespondeCredito,aceptarEntrega,disponibilidad,cambiarLinea} from '../lib/service.js';
import {repartoSugerido,fechaLimaHoy,sumarDias,fechaCobertura} from '../lib/rules.js';
import {siguientePaso,estadoComercial,pendientesDescuento,resumenHabilitado,firmaCondiciones,confirmacionVigente,creditoInsuficiente} from '../lib/negociacion.js';

const fecha=x=>!x?null:typeof x==='string'?x.slice(0,10):new Date(x).toISOString().slice(0,10);
const nombres={'PRD-001':'leche UHT entera','PRD-002':'leche evaporada','PRD-003':'leche fresca'};
function resumenStock(prod,d){
  const planes=(d.planes||[]).filter(x=>Number(x.libres)>0).sort((a,b)=>String(a.fecha_disponibilidad).localeCompare(String(b.fecha_disponibilidad)));
  let m=`Consulté el ERP: de ${nombres[prod]||'este producto'} tenemos ${d.disponibles} cajas disponibles y liberadas por Calidad.`;
  if(planes.length) m+=` Además hay ${planes.map(p=>`${p.libres} cajas previstas desde el ${fecha(p.fecha_disponibilidad)}`).join(' y ')}, sujetas a producción, Calidad y despacho.`;
  else m+=' No hay producción futura registrada disponible en el plan actual.';
  return m;
}
function cobertura(q){
  const d=q.disponibilidad;const faltante=Math.max(0,q.cantidad-d.disponibles);
  return repartoSugerido(q.cantidad,d.disponibles,d.planificadas,fechaCobertura(d.planes,Math.min(faltante,d.planificadas)));
}
function resumenLineas(q){return (q?.items||[]).map(x=>`${x.cantidad} cajas de ${x.producto_nombre}`).join(' y ');}
function propuesta(q,estado){
  if(q?.items?.length>1){
    const faltan=q.items.map(x=>({nombre:x.producto_nombre,cajas:x.cantidad,
      sinCobertura:Math.max(0,x.cantidad-x.disponibilidad.disponibles-x.disponibilidad.planificadas)}))
      .filter(x=>x.sinCobertura>0);
    estado.esperando=faltan.length?'REVISAR_COBERTURA_MULTI':'ELEGIR_FECHA';
    if(faltan.length)return `Llevamos ${resumenLineas(q)}. Antes de cerrar, falta cobertura para ${faltan.map(x=>`${x.sinCobertura} cajas de ${x.nombre}`).join(' y ')}. ¿Deseas ajustar ese producto o que consulte Planeamiento?`;
    return `Perfecto, llevamos ${resumenLineas(q)} en una sola cotización. ¿Para cuándo necesitas recibirlas? También podemos distribuir las entregas por producto.`;
  }
  const s=cobertura(q);estado.cantidad_pendiente=null;
  if(s.sin_cobertura>0){
    estado.esperando='REDUCIR_CANTIDAD';estado.cantidad_ofrecida=s.inmediato+s.futuro;
    return `Anoté ${q.cantidad} cajas de ${q.producto_nombre}. ${s.inmediato} están liberadas; otras ${s.futuro} figuran en producción${s.fecha2?` desde el ${s.fecha2}`:''}. Las ${s.sin_cobertura} restantes no tienen cobertura programada. Puedes conservar la solicitud de ${q.cantidad} (sin fecha confirmada para el faltante) o REDUCIR el total a ${estado.cantidad_ofrecida} cajas. Una entrega parcial no reduce automáticamente tu pedido. Para reducirlo, escribe «reducir a ${estado.cantidad_ofrecida} cajas». ¿Qué prefieres?`;
  }
  if(s.faltante>0){
    estado.esperando='ELEGIR_ENTREGA';
    return `Anoté ${q.cantidad} cajas de ${q.producto_nombre}. Tenemos ${s.inmediato} cajas liberadas y otras ${s.futuro} previstas desde el ${s.fecha2}, sujetas a Calidad. Te propongo ${s.inmediato} cajas desde el ${s.fecha1} (previa validación logística) y las otras ${s.futuro} desde el ${s.fecha2}; o las ${q.cantidad} juntas desde el ${s.fecha2}. ¿Prefieres entrega parcial o completa?`;
  }
  estado.esperando='ELEGIR_FECHA';
  return `Perfecto, anoté ${q.cantidad} cajas de ${q.producto_nombre}. ¿Para qué fecha las necesitas? Si quieres, podemos añadir otro tipo de leche a esta misma cotización.`;
}
function siguienteNatural(q,estado){
  if(!q) return '¿Qué tipo de leche y cuántas cajas necesitas?';
  if(q.estado==='CONFIRMADA'){estado.esperando='PEDIDO_CONFIRMADO';return 'Tu pedido ya está registrado. Puedes consultarlo en Pedidos.';}
  const aprobacion=pendientesDescuento(q);
  if(aprobacion){estado.esperando=aprobacion.estado==='OFERTADO'?'ACEPTAR_DESCUENTO':'ESPERAR_JEFATURA';return siguientePaso(q);}
  if(!q.entregas?.length){estado.esperando='ELEGIR_ENTREGA';return propuesta(q,estado);}
  if(!q.entrega_aceptada){estado.esperando='ACEPTAR_ENTREGA';return `La entrega propuesta es ${q.entregas.map(x=>`${x.cajas} cajas de ${nombres[x.id_producto]||'leche'} el ${fecha(x.fecha)}`).join(' y ')}; quedará sujeta a validación logística y, si hay producción, a Calidad. ¿Aceptas estas fechas?`;}
  if(q.forma_pago==='SIN_DEFINIR'){estado.esperando='ELEGIR_PAGO';return '¿Prefieres pagar al contado, usar el crédito aprobado o un anticipo del 40% (opción académica)?';}
  if(!estado.descuento_consultado&&!q.aprobaciones?.length){estado.esperando='DESCUENTO_OPCIONAL';return '¿Deseas solicitar un descuento antes de cerrar la cotización? Puedes decirme un porcentaje o responder «sin descuento». Si solicitas más del 5%, Jefatura lo evalúa.';}
  if(!q.direccion_confirmada){
    if(estado.direccion_borrador?.direccion && estado.direccion_borrador?.distrito){
      estado.esperando='ACEPTAR_DIRECCION_NUEVA';
      return `¿Confirmas la nueva dirección ${estado.direccion_borrador.direccion}, ${estado.direccion_borrador.distrito}?`;
    }
    estado.esperando='CONFIRMAR_DIRECCION';return `¿Confirmas la dirección registrada ${q.direccion||'del cliente'}, ${q.distrito||'Lima'}, o deseas enviarlo a otra dirección?`;
  }
  if(creditoInsuficiente(q)){estado.esperando='REVISAR_CREDITO';return siguientePaso(q);}
  if(!resumenHabilitado(q)){estado.esperando='REVISAR_CONDICIONES';return siguientePaso(q);}
  estado.esperando='CONFIRMAR_PEDIDO';estado.confirmacion_final={id:q.id_cotizacion,firma:firmaCondiciones(q)};return siguientePaso(q);
}
async function encontrarSesion(id,idCliente){
 if(id&&/^[a-f0-9-]{36}$/i.test(id)){
  const s=await uno('SELECT * FROM conversaciones WHERE id_conversacion=$1 AND id_cliente=$2',[id,idCliente]);
  if(s)return s;
 }
 return uno('INSERT INTO conversaciones(id_cliente) VALUES($1) RETURNING *',[idCliente]);
}
async function atender(req,res){
 try{
  metodo(req,['POST']);revisarAcceso(req);
  const texto=obligatorio(req.body?.mensaje,'Mensaje',1200);
  const idCliente=req.body?.id_cliente;
  const contexto=await contextoCliente(idCliente);
  const sesion=await encontrarSesion(req.body?.id_conversacion,idCliente);
  const qid=req.body?.id_cotizacion||sesion.id_cotizacion;
  let q=qid?await detalleCotizacion(qid).catch(()=>null):null;
  if(q&&q.id_cliente!==idCliente)falla('Cotización de otro cliente.',403);
  const estado=estadoAnterior(Array.isArray(sesion.mensajes)?sesion.mensajes:[]);
  const ultimoAgente=[...(Array.isArray(sesion.mensajes)?sesion.mensajes:[])].reverse().find(x=>x.rol==='agente')?.texto||'';
  estado.hoy=fechaLimaHoy();
  if(q&&!estado.producto)estado.producto=q.id_producto;
  const interpretacion=await interpretar(texto,{
   cliente:contexto.cliente.razon_social,credito:contexto.cliente.linea_credito,fecha_hoy:estado.hoy,
   estado_negociacion:{producto:estado.producto,esperando:estado.esperando,cantidad_pendiente:estado.cantidad_pendiente,fecha_deseada:estado.fecha_deseada},
   cotizacion:q?{producto:q.producto_nombre,items:q.items?.map(x=>({id:x.id_producto,nombre:x.producto_nombre,cajas:x.cantidad})),cantidad:q.cantidad,descuento:q.descuento_pct,estado:q.estado,entrega_aceptada:q.entrega_aceptada,pago:q.forma_pago,entregas:q.entregas}:null,
   historial:Array.isArray(sesion.mensajes)?sesion.mensajes:[]
  });
  const d=leerTurno(texto,{estado,cotizacion:q,interpretacion});
  const productoDicho=productoExplicito(texto);
  if(productoDicho && !q)estado.producto=productoDicho;
  let mensaje='',observacion='Reglas ERP/CRM verificadas';
  const mayorDeUno=ctx=>ctx.cantidad_pendiente&&ctx.cantidad_pendiente>0;
  const nuevaCotizacion=async(prod,cant)=>{
    if(!prod){estado.cantidad_pendiente=cant;estado.esperando='PEDIR_PRODUCTO';return null;}
    estado.producto=prod;estado.cantidad_pendiente=null;estado.descuento_consultado=false;
    if(q&&q.estado!=='CONFIRMADA'&&q.id_producto===prod&&Number(q.cantidad)===cant)return q;
    if(q&&q.estado!=='CONFIRMADA')return modificarCotizacion(q.id_cotizacion,{id_producto:prod,cantidad:cant});
    return crearCotizacion(idCliente,prod,cant);
  };
  try{
   // Una aceptación se interpreta respecto a la pregunta pendiente. Si hay falta de
   // cobertura, nunca se convierte un «sí» genérico en pedido confirmado.
   if(esEscenarioPC3() && /\b(?:caso\s+pc3|caso\s+del\s+informe|escenario\s+pc3)\b/.test(d.textoNormalizado)){
     // La solicitud académica se prepara en tres líneas de UNA cotización.
     // No se reserva inventario ni se promete ninguna fecha en este paso.
     q=await crearCotizacion(idCliente,'PRD-001',180);
     q=await cambiarLinea(q.id_cotizacion,'PRD-002',60,{modo:'AGREGAR'});
     q=await cambiarLinea(q.id_cotizacion,'PRD-003',120,{modo:'AGREGAR'});
     const reparto=await proponerEntrega(q.id_cotizacion,{modo:'DOS_PARTES'});
     q=reparto.cotizacion;
     estado.producto='PRD-002';estado.esperando='ACEPTAR_ENTREGA';
     mensaje='Listo, revisé tu pedido de 360 cajas: 180 de UHT, 60 de evaporada de 400 g y 120 de fresca. Para el 16/11 tenemos cobertura para 340. Las otras 20 son de evaporada y están previstas desde el 17/11 según OP-EVA-1711, sujetas a Calidad y logística. La cerradora tuvo una parada de dos horas el 13/11, que afectó la capacidad. ¿Te parece recibir 340 cajas el 16 y las 20 restantes el 17?';
   } else if(q?.entregas?.length && !q.entrega_aceptada && mencionaRepartoConAceptacion(texto)){
     if(aceptaRepartoPropuesto(texto,q.entregas)){
       const r=await aceptarEntrega(q.id_cotizacion,true);q=r.cotizacion;
       mensaje=`Perfecto: aceptaste el reparto de ${q.entregas.reduce((n,p)=>n+Number(p.cajas),0)} cajas en las fechas propuestas, sujeto a Calidad y logística.\n${siguienteNatural(q,estado)}`;
     } else {
       estado.esperando='ACEPTAR_ENTREGA';
       mensaje=`Antes de registrar tu aceptación, necesito confirmar las cantidades y fechas exactas: ${q.entregas.map(x=>`${x.cajas} cajas de ${nombres[x.id_producto]||'leche'} para el ${fecha(x.fecha)}`).join('; ')}. ¿Aceptas este esquema o prefieres modificarlo?`;
     }
   } else if(q && q.estado!=='CONFIRMADA' && d.accion==='STOCK' && q.items?.length){
     // Consulta informativa: conserva íntegros cotización, fechas y etapa comercial.
     // No fuerza la pregunta sobre cantidades cuando el pedido ya existe.
     mensaje=explicarStockDeCotizacion(q,productoDicho);
   } else if(esEscenarioPC3() && /\b(?:cerradora|mantenimiento|parada\s+de\s+2|por\s+que\s+falta\s+evaporada)\b/.test(d.textoNormalizado)){
     mensaje='En el escenario PC3, la cerradora tiene una parada programada de 2 horas el 13/11/2026 (VEN-CIE-001). La capacidad de la línea en tres turnos baja de 19,200 a 17,600 cajas frente a 18,000 de carga (brecha de 400). Para La Alameda, se observa un faltante específico de 20 cajas de evaporada el 16/11 y se plantea OP-EVA-1711 para el 17/11. Las 400 cajas son una brecha agregada de capacidad, no 400 cajas faltantes en el pedido.';
   } else if(estado.esperando==='CONFIRMAR_TIPO_LECHE' && esConfirmacionCorta(texto)){
     estado.producto=estado.producto_pendiente;estado.producto_pendiente=null;
     estado.esperando=estado.agregando_producto?'CANTIDAD_ADICIONAL':'PEDIR_CANTIDAD';
     if(estado.cantidad_pendiente){const qty=estado.cantidad_pendiente;estado.cantidad_pendiente=null;
       q=q?await cambiarLinea(q.id_cotizacion,estado.producto,qty,{modo:'AGREGAR'}):await nuevaCotizacion(estado.producto,qty);
       estado.agregando_producto=false;mensaje=`Perfecto. Registré ${qty} cajas de ${nombres[estado.producto]}. ${propuesta(q,estado)}`;
     }else mensaje=`¡Perfecto, ${nombres[estado.producto]}! ¿Cuántas cajas deseas ${estado.agregando_producto?'agregar':'cotizar'}?`;
   } else if(d.accion==='ACLARAR_FECHA'){
     estado.esperando='ACLARAR_FECHA';
     mensaje='¿Te refieres a la fecha de vencimiento del lote o a cuándo podríamos entregarte el producto? Así te doy el dato correcto.';
   } else if(d.accion==='VENCIMIENTO'){
     const prod=productoDicho||estado.producto||q?.id_producto;
     if(!prod)mensaje='¿De qué leche quieres saber el vencimiento: UHT, evaporada o fresca?';
     else{
       const st=await disponibilidad(prod);
       const lotes=(st.lotes||[]).filter(x=>Number(x.libres)>0).sort((a,b)=>String(a.fecha_vencimiento).localeCompare(String(b.fecha_vencimiento)));
       mensaje=lotes.length?`Los lotes liberados de ${nombres[prod]} que tenemos disponibles vencen entre el ${fecha(lotes[0].fecha_vencimiento)} y el ${fecha(lotes.at(-1).fecha_vencimiento)}. La fecha exacta depende del lote que se asigne; ¿quieres saber de la entrega?`:`Ahora mismo no encuentro lotes liberados de ${nombres[prod]} con existencias. Puedo consultar el plan de producción.`;
     }
   } else if(estado.esperando==='ELEGIR_CAMBIO_LINEA'&&q&&/\b(?:sumar|agregar|anadir|anade)\b/.test(d.textoNormalizado)){
     q=await cambiarLinea(q.id_cotizacion,estado.producto_cambio,estado.cantidad_cambio,{modo:'AGREGAR'});
     mensaje=`Sumé esas cajas. Ahora llevamos ${resumenLineas(q)}. ¿Coordinamos entrega?`;
     estado.producto=estado.producto_cambio;estado.producto_cambio=null;estado.cantidad_cambio=null;estado.esperando='AGREGAR_MAS';
   } else if(estado.esperando==='ELEGIR_CAMBIO_LINEA'&&q&&/\b(?:cambiar|modificar|reemplazar|dejar|ajustar)\b/.test(d.textoNormalizado)){
     q=await cambiarLinea(q.id_cotizacion,estado.producto_cambio,estado.cantidad_cambio,{modo:'FIJAR'});
     mensaje=`Actualicé el producto. Ahora llevamos ${resumenLineas(q)}. ¿Coordinamos entrega?`;
     estado.producto=estado.producto_cambio;estado.producto_cambio=null;estado.cantidad_cambio=null;estado.esperando='AGREGAR_MAS';
   } else if(d.accion==='AGREGAR_PRODUCTO'){
     estado.agregando_producto=true;
     if(q && productoDicho && d.cantidad){
       q=await cambiarLinea(q.id_cotizacion,productoDicho,d.cantidad,{modo:'AGREGAR'});
       estado.producto=productoDicho;estado.agregando_producto=false;estado.esperando='AGREGAR_MAS';
       mensaje=`Añadí ${d.cantidad} cajas de ${nombres[productoDicho]}. En total llevamos ${resumenLineas(q)}. ¿Seguimos añadiendo o coordinamos la entrega?`;
     }else if(productoDicho){
       estado.producto=productoDicho;estado.esperando='CANTIDAD_ADICIONAL';
       mensaje=`Perfecto, ¿cuántas cajas de ${nombres[productoDicho]} deseas añadir?`;
     }else{
       estado.esperando='AGREGAR_PRODUCTO';
       mensaje=q?`¡Por supuesto! Conservamos ${resumenLineas(q)}. ¿Qué otra leche quieres añadir: UHT, evaporada o fresca?`:'¡Claro! Podemos cotizar UHT, evaporada y fresca. ¿Cuál deseas primero?';
     }
   } else if(d.accion==='QUITAR_PRODUCTO'){
     const prod=productoDicho||estado.producto;
     if(!q)mensaje='Aún no tenemos productos en una cotización. ¿Cuál deseas primero?';
     else if(!productoDicho)mensaje=`¿Qué producto deseas quitar? Ahora llevamos ${resumenLineas(q)}.`;
     else if(q.items?.length===1)mensaje='No puedo dejar la cotización sin productos; puedes iniciar otra simulación.';
     else{
       q=await cambiarLinea(q.id_cotizacion,prod,1,{modo:'QUITAR'});
       estado.producto=q.id_producto;estado.agregando_producto=false;
       mensaje=`Quité ${nombres[prod]} de la cotización. Quedan ${resumenLineas(q)}. ¿Quieres añadir algo más o acordamos la entrega?`;
     }
   } else if(d.nombreCorregido && productoDicho && d.accion!=='CONSULTAR'){
     if(q && productoDicho!==q.id_producto)estado.agregando_producto=true;
     estado.producto_pendiente=productoDicho;estado.cantidad_pendiente=d.cantidad;
     estado.esperando='CONFIRMAR_TIPO_LECHE';
     mensaje=`¿Te refieres a ${nombres[productoDicho]}? Si es así, la agregamos correctamente a la cotización.`;
   } else if(estado.esperando==='CONFIRMAR_TIPO_LECHE' && d.accion==='NO'){
     estado.producto_pendiente=null;estado.esperando='AGREGAR_PRODUCTO';
     mensaje='Entendido. ¿Querías UHT, evaporada o fresca?';
   } else if(q && d.accion==='CANTIDAD' && (estado.agregando_producto||estado.esperando==='CANTIDAD_ADICIONAL')){
     const prod=productoDicho||estado.producto;
     if(!prod){estado.esperando='AGREGAR_PRODUCTO';mensaje='¿De qué tipo de leche deseas añadir cajas?';}
     else{
       q=await cambiarLinea(q.id_cotizacion,prod,d.cantidad||interpretacion.cantidad,{modo:'AGREGAR'});
       estado.producto=prod;estado.agregando_producto=false;estado.esperando='AGREGAR_MAS';
       mensaje=`Añadí las ${d.cantidad||interpretacion.cantidad} cajas de ${nombres[prod]} sin quitar las anteriores. Ahora llevamos ${resumenLineas(q)}. ¿Quieres agregar otra leche o coordinamos la entrega?`;
     }
   } else if(q && d.accion==='PRODUCTO' && estado.agregando_producto){
     estado.producto=productoDicho||d.producto;estado.esperando='CANTIDAD_ADICIONAL';
     mensaje=`Perfecto, ${nombres[estado.producto]}. ¿Cuántas cajas quieres añadir?`;
   } else if(q && d.accion==='CANTIDAD' && productoDicho && productoDicho!==q.id_producto && !q.items?.some(x=>x.id_producto===productoDicho)){
     // Es preferible añadir una línea a sustituir silenciosamente la primera.
     q=await cambiarLinea(q.id_cotizacion,productoDicho,d.cantidad||interpretacion.cantidad,{modo:'AGREGAR'});
     estado.producto=productoDicho;estado.esperando='AGREGAR_MAS';
     mensaje=`Agregué ${d.cantidad||interpretacion.cantidad} cajas de ${nombres[productoDicho]}. Conservé los otros productos: ${resumenLineas(q)}. ¿Añadimos otra leche o vemos la entrega?`;
   } else if(q && d.accion==='CANTIDAD' && q.items?.length>1){
     const prod=productoDicho||estado.producto;
     if(!prod)mensaje=`Llevamos ${resumenLineas(q)}. ¿Cuál deseas modificar?`;
     else if(/\b(?:cambia|cambiar|modifica|modificar|dejemos|ajusta)\b/.test(d.textoNormalizado)){
       q=await cambiarLinea(q.id_cotizacion,prod,d.cantidad||interpretacion.cantidad,{modo:'FIJAR'});
       mensaje=`Actualicé las cajas de ${nombres[prod]}. Ahora llevamos ${resumenLineas(q)}. ¿Seguimos con las entregas?`;
     }else {estado.esperando='ELEGIR_CAMBIO_LINEA';estado.producto_cambio=prod;estado.cantidad_cambio=d.cantidad||interpretacion.cantidad;mensaje=`Ya tenemos ${resumenLineas(q)}. ¿Deseas sumar ${d.cantidad} cajas de ${nombres[prod]} o cambiar su cantidad a ${d.cantidad}?`;}
   } else if(q && d.accion==='ENTREGA' && q.items?.length>1 || q && (d.accion==='FECHA'||d.accion==='FECHA_RELATIVA') && q.items?.length>1){
     const faltan=q.items.filter(x=>x.cantidad>x.disponibilidad.disponibles+x.disponibilidad.planificadas);
     if(faltan.length)mensaje=`Antes de coordinar, falta cobertura de ${faltan.map(x=>x.producto_nombre).join(' y ')}. Puedo ayudarte a ajustar las cajas.`;
     else if(d.fecha||d.modo){
       const casoOficial=esEscenarioPC3() && q.items?.length===3 && q.items.some(x=>x.id_producto==='PRD-002'&&Number(x.cantidad)===60);
       const pide16=casoOficial && d.fecha===PRIMERA_ENTREGA_PC3;
       const modo=pide16||d.modo==='DOS_PARTES'?'DOS_PARTES':'TODO_DESPUES';
       const r=await proponerEntrega(q.id_cotizacion,{modo,fecha:pide16?undefined:d.fecha||undefined});q=r.cotizacion;
       estado.esperando='ACEPTAR_ENTREGA';
       mensaje=(pide16?'No hay 60 cajas de evaporada liberadas para el 16/11: solo hay 40. Las otras 20 dependen de la orden OP-EVA-1711 y de la parada de mantenimiento de 2 h de la cerradora el 13/11. Por eso no puedo prometer las 360 juntas ese día. ':'')+r.mensaje;
     }else{estado.esperando='ELEGIR_FECHA';mensaje=`Para ${resumenLineas(q)}, ¿qué fecha prefieres? Puedes recibir todo junto o por partes.`;}
   } else if(q && pendientesDescuento(q)?.estado==='OFERTADO' && esAceptacionDescuento(texto)){
     const ap=pendientesDescuento(q);
     const r=await clienteRespondeDescuento(ap.id_solicitud,true);
     q=r.cotizacion;estado.descuento_consultado=true;
     mensaje=`${r.mensaje}\n${siguienteNatural(q,estado)}`;
   } else if(estado.esperando==='REDUCIR_CANTIDAD' && confirmaReduccion(texto,estado.cantidad_ofrecida)){
     if(!q||!estado.cantidad_ofrecida){mensaje='Necesitamos revisar primero el inventario.';}
     else {
       q=await modificarCotizacion(q.id_cotizacion,{cantidad:estado.cantidad_ofrecida});
       estado.cantidad_ofrecida=null;
       const s=cobertura(q);
       if(s.sin_cobertura>0){mensaje=(d.modo==='TODO_DESPUES'?'No puedo ofrecer la entrega completa con el plan actual. ':'')+propuesta(q,estado);}
       else if(s.faltante>0){const r=await proponerEntrega(q.id_cotizacion,{modo:'DOS_PARTES'});q=r.cotizacion;estado.esperando='ACEPTAR_ENTREGA';mensaje=`Actualicé la cotización a ${q.cantidad} cajas, como aceptaste. ${r.mensaje}`;}
       else {mensaje=propuesta(q,estado);}
     }
   } else if(estado.esperando==='REDUCIR_CANTIDAD' && d.modo==='DOS_PARTES'){
     const s=cobertura(q);
     mensaje=`Podemos coordinar una entrega parcial de las ${s.inmediato+s.futuro} cajas cubiertas, pero tu solicitud sigue siendo de ${q.cantidad}. Para cotizar solamente ${s.inmediato+s.futuro}, indícame «reducir a ${s.inmediato+s.futuro} cajas». Las ${s.sin_cobertura} restantes requieren Planeamiento y todavía no tienen fecha.`;
   } else if(estado.esperando==='REDUCIR_CANTIDAD' && d.accion==='NO'){
     estado.esperando='ESPERAR_PLANEAMIENTO';mensaje=`Mantendremos la solicitud original de ${q.cantidad} cajas. Solo ${cobertura(q).inmediato+cobertura(q).futuro} cuentan con cobertura; las restantes requieren planificación. No hay fecha confirmable para el total. ¿Quieres que ajustemos la cantidad o revisamos otra leche?`;
   } else if(estado.esperando==='ACEPTAR_DIRECCION_NUEVA' && (esConfirmacionCorta(texto)||esAceptacionDireccion(texto))){
     if(!q||!estado.direccion_borrador?.direccion||!estado.direccion_borrador?.distrito){mensaje='Indícame la calle, número y distrito antes de confirmar una nueva dirección.';estado.esperando='PEDIR_DIRECCION';}
     else {
       const b=estado.direccion_borrador;
       const id='DIR-'+randomUUID();
       await consulta('INSERT INTO direcciones_entrega(id_direccion,id_cliente,direccion,distrito,principal) VALUES($1,$2,$3,$4,false)',[id,idCliente,b.direccion,b.distrito]);
       const r=await confirmarDireccion(q.id_cotizacion,id);q=r.cotizacion;estado.direccion_borrador=null;
       mensaje=`${r.mensaje}\n${siguienteNatural(q,estado)}`;
     }
   } else if(estado.esperando==='ACEPTAR_DIRECCION_NUEVA' && d.accion==='NO'){
     estado.direccion_borrador=null;estado.esperando='PEDIR_DIRECCION';mensaje='Entendido, no registraré esa dirección. ¿Cuál es la calle, número y distrito correctos?';
   } else if(estado.esperando==='DESCUENTO_OPCIONAL' && (d.accion==='NO'||d.accion==='SIN_DESCUENTO')){
     estado.descuento_consultado=true;mensaje=`Sin problema, mantendremos el descuento actual de ${q?.descuento_pct||0}%. ${siguienteNatural(q,estado)}`;
   } else if(estado.esperando==='ELEGIR_ENTREGA' && q && d.accion==='SI'){
     const s=cobertura(q);mensaje=`Para registrar una propuesta, ¿prefieres ${s.inmediato} cajas primero y ${s.futuro} después de producción, o todas las ${q.cantidad} juntas desde el ${s.fecha2}?`;
   } else if(estado.esperando==='ELEGIR_FECHA' && q && d.accion==='SI' && cobertura(q).faltante===0){
     const r=await proponerEntrega(q.id_cotizacion,{modo:'TODO_DESPUES',fecha:sumarDias(estado.hoy,1)});q=r.cotizacion;estado.esperando='ACEPTAR_ENTREGA';mensaje=r.mensaje;
   } else if(estado.esperando==='ACEPTAR_ENTREGA' && q?.entregas?.length && !q.entrega_aceptada && (esConfirmacionCorta(texto)||esAceptacionEntrega(texto))){
     const r=await aceptarEntrega(q.id_cotizacion,true);q=r.cotizacion;mensaje=`${r.mensaje}\n${siguienteNatural(q,estado)}`;
   } else if(q && pendientesDescuento(q)?.estado==='OFERTADO' && esAfirmacion(texto) && /descuento|jefatura|porcentaje/.test(d.textoNormalizado)){
     const r=await clienteRespondeDescuento(pendientesDescuento(q).id_solicitud,true);q=r.cotizacion;estado.descuento_consultado=true;mensaje=`${r.mensaje}\n${siguienteNatural(q,estado)}`;
   } else if(d.accion==='SIN_DESCUENTO'){
     estado.descuento_consultado=true;mensaje=q?`No solicitaremos un descuento adicional; tu cotización conserva el ${q.descuento_pct}% que ya figura aplicado. ${siguienteNatural(q,estado)}`:'Perfecto, podemos cotizar sin descuento. ¿Qué leche y cuántas cajas necesitas?';
   } else if(estado.esperando==='OFRECER_COTIZACION'&&d.accion==='SI'&&estado.cantidad_pendiente&&estado.producto){
     q=await nuevaCotizacion(estado.producto,estado.cantidad_pendiente);mensaje=propuesta(q,estado);
   } else if(d.accion==='STOCK_CANTIDAD'){
     const prod=productoDicho||estado.producto||q?.id_producto;
     if(!prod){estado.cantidad_pendiente=d.cantidad;estado.esperando='PEDIR_PRODUCTO';mensaje=`¿De qué tipo de leche quieres verificar las ${d.cantidad} cajas: UHT, evaporada o fresca?`;}
     else{
       estado.producto=prod;estado.cantidad_pendiente=d.cantidad;estado.esperando='OFRECER_COTIZACION';
       const a=await disponibilidad(prod);const faltan=Math.max(0,d.cantidad-a.disponibles);
       const c=repartoSugerido(d.cantidad,a.disponibles,a.planificadas,fechaCobertura(a.planes,Math.min(faltan,a.planificadas)));
       mensaje=`Para ${d.cantidad} cajas de ${nombres[prod]}, tenemos ${c.inmediato} liberadas ahora.`;
       if(c.futuro>0)mensaje+=` Otras ${c.futuro} están previstas desde el ${c.fecha2}, sujetas a Calidad.`;
       if(c.sin_cobertura>0)mensaje+=` Quedarían ${c.sin_cobertura} sin producción programada; no puedo garantizar el total.`;
       else if(c.faltante===0)mensaje+=' Tenemos disponibilidad suficiente en lotes liberados.';
       mensaje+=` ¿Quieres que prepare una cotización por ${d.cantidad} cajas para negociar las fechas?`;
     }
   } else if(d.accion==='STOCK'||d.accion==='TODO_STOCK'){
     const prod=productoDicho||estado.producto||q?.id_producto;
     if(!prod){estado.esperando='PEDIR_PRODUCTO';mensaje='¡Claro! ¿De qué leche quieres conocer el stock: UHT, evaporada o fresca?';}
     else {
       estado.producto=prod;
       const stock=await disponibilidad(prod);
       mensaje=resumenStock(prod,stock);
       if(d.accion==='TODO_STOCK'){
         if(stock.disponibles<=0)mensaje+=' No hay cajas liberadas para cotizar ahora. ¿Quieres evaluar la producción programada?';
         else {q=await nuevaCotizacion(prod,stock.disponibles);mensaje+=` Como pediste todo el stock disponible, preparé una cotización por ${stock.disponibles} cajas. ${propuesta(q,estado)}`;}
       }else{estado.esperando='PEDIR_CANTIDAD';mensaje+=' ¿Cuántas cajas deseas cotizar? También puedes pedir todas las disponibles.';}
     }
   } else if(d.accion==='CANTIDAD' && (d.cantidad||interpretacion.cantidad)){
     const n=d.cantidad||interpretacion.cantidad;
     const prod=productoDicho||estado.producto||q?.id_producto;
     q=await nuevaCotizacion(prod,n);
     mensaje=q?propuesta(q,estado):`Perfecto, ${n} cajas. ¿Las quieres de leche UHT, evaporada o fresca?`;
   } else if(d.accion==='PRODUCTO'){
     const prod=productoDicho||d.producto;
     if(!prod){mensaje='¿Qué tipo de leche deseas: UHT, evaporada o fresca?';}
     else if(q && prod!==q.id_producto){estado.producto=prod;estado.esperando='CAMBIAR_PRODUCTO';mensaje=`Tienes una cotización por ${q.cantidad} cajas de ${q.producto_nombre}. ¿Quieres cambiarla a ${nombres[prod]} manteniendo la cantidad?`;}
     else if(mayorDeUno(estado)){
       q=await nuevaCotizacion(prod,estado.cantidad_pendiente);mensaje=propuesta(q,estado);
     }else{
       estado.producto=prod;estado.esperando='PEDIR_CANTIDAD';const stock=await disponibilidad(prod);
       mensaje=`Elegiste ${nombres[prod]}. ${resumenStock(prod,stock)} ¿Cuántas cajas necesitas?`;
     }
   } else if(estado.esperando==='CAMBIAR_PRODUCTO' && d.accion==='SI'){
     q=await nuevaCotizacion(estado.producto,q.cantidad);mensaje=propuesta(q,estado);
   } else if(d.accion==='CONSULTAR'){
     const tema=d.consulta||interpretacion.tema_consulta||'general';
     mensaje=estadoComercial({q,contexto,tema});
     if(tema==='descuento' && pendientesDescuento(q)?.estado==='OFERTADO')estado.esperando='ACEPTAR_DESCUENTO';
   } else if(d.accion==='CATALOGO'){
     mensaje='Tenemos leche UHT entera 1 L, evaporada 400 g y fresca 1 L. También puedo consultar stock y precios sin que tengas que crear un pedido. ¿Cuál te interesa?';
   } else if(d.accion==='ENTREGA' || d.accion==='FECHA' || d.accion==='FECHA_RELATIVA'){
     if(!q){estado.esperando=estado.producto?'PEDIR_CANTIDAD':'PEDIR_PRODUCTO';mensaje=estado.producto?`¿Cuántas cajas de ${nombres[estado.producto]} necesitas?`:'¿Qué leche y cuántas cajas necesitas?';}
     else {
       const s=cobertura(q);
       if(s.sin_cobertura>0){mensaje=(d.modo==='TODO_DESPUES'?'No puedo ofrecer la entrega completa con el plan actual. ':'')+propuesta(q,estado);}
       else if(d.accion==='FECHA_RELATIVA'){
         mensaje=`Para esta semana debo contrastar tu fecha con la disponibilidad. ${propuesta(q,estado)}`;
       }else if(d.partes){
         const [primera,segunda]=d.partes;
         if(primera+segunda!==q.cantidad){mensaje=`Tu cotización es por ${q.cantidad} cajas, pero has distribuido ${primera+segunda}. ¿Quieres modificar la cantidad total o indicar cómo entregaremos las ${q.cantidad} cajas?`;}
         else{
           const fecha1=d.fecha1||s.fecha1,fecha2=d.fecha2||(s.faltante?s.fecha2:sumarDias(s.fecha1,3));
           const r=await proponerEntrega(q.id_cotizacion,{modo:'PERSONALIZADA',partes:[{cajas:primera,fecha:fecha1},{cajas:segunda,fecha:fecha2}]});
           q=r.cotizacion;estado.esperando='ACEPTAR_ENTREGA';mensaje=r.mensaje;
         }
       }else if(d.modo==='DOS_PARTES'||/\bparcial\b/.test(d.textoNormalizado)){
         const r=await proponerEntrega(q.id_cotizacion,{modo:'DOS_PARTES'});q=r.cotizacion;estado.esperando='ACEPTAR_ENTREGA';mensaje=r.mensaje;
       }else if(d.modo==='TODO_DESPUES'){
         const target=d.fecha||estado.fecha_deseada||(s.faltante?s.fecha2:s.fecha1);
         if(s.faltante&&target<s.fecha2){mensaje=`No puedo ofrecer las ${q.cantidad} juntas el ${target}; las ${s.futuro} previstas estarían disponibles desde el ${s.fecha2} tras Calidad. ¿Quieres las ${q.cantidad} juntas desde el ${s.fecha2}, o en dos entregas?`;estado.esperando='ELEGIR_ENTREGA';}
         else {const r=await proponerEntrega(q.id_cotizacion,{modo:'TODO_DESPUES',fecha:target});q=r.cotizacion;estado.esperando='ACEPTAR_ENTREGA';mensaje=r.mensaje;}
       }else if(d.fecha){
         estado.fecha_deseada=d.fecha;
         if(s.faltante&&s.fecha2&&d.fecha<s.fecha2){
           estado.esperando='ELEGIR_ENTREGA';mensaje=`Para el ${d.fecha} solo puedo respaldar ${s.inmediato} cajas liberadas. ${s.futuro} están previstas desde el ${s.fecha2}, sujetas a Calidad. ¿Prefieres dos entregas o todo junto desde el ${s.fecha2}?`;
         }else{
           const r=await proponerEntrega(q.id_cotizacion,{modo:'TODO_DESPUES',fecha:d.fecha});q=r.cotizacion;estado.esperando='ACEPTAR_ENTREGA';mensaje=r.mensaje;
         }
       }else if(q.entregas?.length){mensaje=`${estadoComercial({q,contexto,tema:'entrega'})} ${siguienteNatural(q,estado)}`;}
       else mensaje=propuesta(q,estado);
     }
   } else if(d.accion==='DESCUENTO'){
     if(!q){mensaje='Para calcular un descuento primero necesito la leche y el número de cajas.';}
     else if(d.descuentoPct===null && interpretacion.descuento_pct==null){estado.esperando='PEDIR_DESCUENTO';mensaje='El asesor puede ofrecer hasta 5% según margen; Jefatura evalúa de 5% a 12%. ¿Qué porcentaje solicitas?';}
     else {const pct=d.descuentoPct??interpretacion.descuento_pct;const r=await solicitarDescuento(q.id_cotizacion,pct);q=r.cotizacion;estado.descuento_consultado=true;mensaje=`${r.mensaje}\n${siguienteNatural(q,estado)}`;}
   } else if(d.accion==='PAGO'){
     if(!q){mensaje='Primero necesitamos preparar la cotización con producto y cantidad.';}
     else if(!d.pago){estado.esperando='ELEGIR_PAGO';mensaje='Podemos trabajar al contado, con el crédito aprobado o con anticipo académico del 40%. ¿Cuál eliges?';}
     else {
       const r=await definirPago(q.id_cotizacion,d.pago);q=r.cotizacion;mensaje=r.mensaje;
       if(d.direccion){
         estado.direccion_borrador=d.direccion;
         if(!d.direccion.direccion||!d.direccion.distrito){estado.esperando='PEDIR_DIRECCION';mensaje+=' Para usar otra dirección, indícame calle, número y distrito.';}
         else{estado.esperando='ACEPTAR_DIRECCION_NUEVA';mensaje+=` ¿Confirmas como nueva dirección: ${d.direccion.direccion}, ${d.direccion.distrito}?`;}
       }else mensaje+=`\n${siguienteNatural(q,estado)}`;
     }
   } else if(d.accion==='CREDITO'){
     mensaje=estadoComercial({q,contexto,tema:'credito'})+' Si deseas ampliar la línea, Finanzas debe autorizarla desde su pestaña.';
   } else if(d.accion==='DIRECCION'){
     if(!q){mensaje='Primero necesitamos preparar una cotización para acordar la entrega.';}
     else {
       const t=d.textoNormalizado;
       const conocida=contexto.direcciones?.find(x=>t.includes(x.direccion.toLowerCase())||(t.includes('direccion registrada')&&x.principal));
       if(conocida){const r=await confirmarDireccion(q.id_cotizacion,conocida.id_direccion);q=r.cotizacion;mensaje=`${r.mensaje}\n${siguienteNatural(q,estado)}`;}
       else if(d.direccion?.direccion&&(d.direccion?.distrito||estado.direccion_borrador?.distrito)){const b={...estado.direccion_borrador,...d.direccion,distrito:d.direccion.distrito||estado.direccion_borrador?.distrito};estado.direccion_borrador=b;estado.esperando='ACEPTAR_DIRECCION_NUEVA';mensaje=`Puedo registrar la nueva dirección ${b.direccion}, ${b.distrito}. ¿La confirmas?`;}
       else {if(d.direccion)estado.direccion_borrador={...estado.direccion_borrador,...d.direccion};estado.esperando='PEDIR_DIRECCION';mensaje=`Indícame la calle, número y distrito. Las direcciones registradas son: ${contexto.direcciones.map(x=>`${x.direccion}, ${x.distrito}`).join(' / ')}.`;}
     }
   } else if(d.accion==='SI'){
     const ap=pendientesDescuento(q),credito=contexto.creditos?.find(x=>x.estado==='OFERTADO');
     if(estado.esperando==='CONFIRMAR_PEDIDO' && esConfirmacionCorta(texto)){
       if(confirmacionVigente(q,estado) && ultimaRespuestaPidePedido(ultimoAgente)){
         const r=await confirmarPedido(q.id_cotizacion);q=await detalleCotizacion(q.id_cotizacion);
         estado.esperando='PEDIDO_CONFIRMADO';estado.confirmacion_final=null;mensaje=r.mensaje;
       }else mensaje=`Las condiciones cambiaron o falta alguna validación. ${siguienteNatural(q,estado)} Revisa el resumen actualizado antes de confirmar.`;
     }
     else if(estado.esperando==='ACEPTAR_DESCUENTO' && ap?.estado==='OFERTADO' && esConfirmacionCorta(texto) && ultimaRespuestaPideDescuento(ultimoAgente)){
       const r=await clienteRespondeDescuento(ap.id_solicitud,true);q=r.cotizacion;estado.descuento_consultado=true;
       mensaje=`${r.mensaje}\n${siguienteNatural(q,estado)}`;
     }
     else if(estado.esperando==='CAMBIAR_PRODUCTO'&&q){q=await nuevaCotizacion(estado.producto,q.cantidad);mensaje=propuesta(q,estado);}
     else if(ap?.estado==='OFERTADO'&&/\b(descuento|porcentaje|jefatura)\b/.test(d.textoNormalizado+' '+String(estado.esperando))){const r=await clienteRespondeDescuento(ap.id_solicitud,true);q=r.cotizacion;mensaje=`${r.mensaje}\n${siguienteNatural(q,estado)}`;}
     else if(credito&&/credito|finanzas/.test(estado.esperando||'')){const r=await clienteRespondeCredito(credito.id_solicitud,true);mensaje=r.mensaje;}
     else if(q?.entregas?.length&&!q.entrega_aceptada&&(esConfirmacionCorta(texto)||esAceptacionEntrega(texto))){const r=await aceptarEntrega(q.id_cotizacion,true);q=r.cotizacion;mensaje=`${r.mensaje}\n${siguienteNatural(q,estado)}`;}
     else if(q&&!q.direccion_confirmada&&estado.esperando==='CONFIRMAR_DIRECCION'&&(esConfirmacionCorta(texto)||esAceptacionDireccion(texto))){const r=await confirmarDireccion(q.id_cotizacion,q.id_direccion);q=r.cotizacion;mensaje=`${r.mensaje}\n${siguienteNatural(q,estado)}`;}
     else if(estado.esperando==='DESCUENTO_OPCIONAL'){estado.esperando='PEDIR_DESCUENTO';mensaje='¿Qué porcentaje de descuento deseas solicitar?';}
     else mensaje=q?siguienteNatural(q,estado):'De acuerdo. ¿Qué tipo de leche y cuántas cajas deseas?';
   } else if(d.accion==='NO'){
     if(estado.esperando==='DESCUENTO_OPCIONAL'){estado.descuento_consultado=true;mensaje=siguienteNatural(q,estado);}
     else mensaje=q?`Podemos modificar la propuesta. ${propuesta(q,estado)}`:'De acuerdo. ¿Qué tipo de leche te interesa?';
   } else if(d.accion==='CONFIRMAR_PEDIDO'){
     if(!q){mensaje='Aún no hay cotización. Necesitamos producto y cantidad.';}
     else if(q.estado==='CONFIRMADA'){mensaje='El pedido ya está registrado.';}
     else if(!resumenHabilitado(q)){mensaje=`Todavía falta completar condiciones: ${siguienteNatural(q,estado)}`;}
     else if(!confirmacionVigente(q,estado)){
       mensaje=`Antes de registrar el pedido, revisa la cotización final y las fechas: ${siguienteNatural(q,estado)} Responde «sí» después de revisar el resumen.`;
     }
     else{const r=await confirmarPedido(q.id_cotizacion);q=await detalleCotizacion(q.id_cotizacion);estado.esperando='PEDIDO_CONFIRMADO';estado.confirmacion_final=null;mensaje=r.mensaje;}
   } else {
     const ap=pendientesDescuento(q);
     if(q&&ap){mensaje=estadoComercial({q,contexto,tema:'descuento'});}
     else mensaje=interpretacion.respuesta_libre||'Con gusto te atiendo. ¿Qué leche y cuántas cajas deseas cotizar?';
   }
  }catch(err){
    if(Number(err?.status)>=500)throw err;
    // No perder estado comercial por una entrada imprecisa.
    mensaje=`No pude registrar esa operación: ${err.message}. ${q?siguienteNatural(q,estado):'Dime qué leche deseas.'}`;
  }
  if(q?.id_cotizacion)q=await detalleCotizacion(q.id_cotizacion);
  const ahora=()=>new Date().toISOString();
  const mensajes=[...(Array.isArray(sesion.mensajes)?sesion.mensajes:[]),
   {rol:'cliente',texto,fecha:ahora()},
   {rol:'agente',texto:mensaje,fecha:ahora(),motor:interpretacion.motor,observacion,estado_chat:estado}
  ].slice(-60);
  await consulta('UPDATE conversaciones SET mensajes=$2::jsonb,id_cotizacion=$3,actualizado_en=now() WHERE id_conversacion=$1',[sesion.id_conversacion,JSON.stringify(mensajes),q?.id_cotizacion||null]);
  respuesta(res,200,{ok:true,id_conversacion:sesion.id_conversacion,mensajes,respuesta:mensaje,cotizacion:q,motor:interpretacion.motor,diagnostico_groq:interpretacion.diagnostico_groq||null,observacion});
 }catch(err){errorJson(res,err);}
}
export default async function handler(req,res){try{await enSimulacion(req,()=>atender(req,res));}catch(err){errorJson(res,err);}}
