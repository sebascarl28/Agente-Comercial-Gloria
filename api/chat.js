import {enSimulacion,consulta,uno} from '../lib/db.js';
import {respuesta,errorJson,revisarAcceso,metodo,falla,obligatorio} from '../lib/http.js';
import {interpretar} from '../lib/ai.js';
import {contextoCliente,crearCotizacion,modificarCotizacion,detalleCotizacion,solicitarDescuento,proponerEntrega,confirmarDireccion,definirPago,confirmarPedido,clienteRespondeDescuento,clienteRespondeCredito,aceptarEntrega} from '../lib/service.js';
import {repartoSugerido,fechaLimaHoy} from '../lib/rules.js';
import {siguientePaso,estadoComercial,pendientesDescuento,resumenHabilitado} from '../lib/negociacion.js';
const fecha=x=>typeof x==='string'?x:x?new Date(x).toISOString().slice(0,10):null;
const soySi=x=>/^(s[ií]|acepto|aceptamos|de acuerdo|me parece bien|confirmo|perfecto|ok)\b/i.test(x.trim());
const esNegativa=x=>/^(no|rechazo|no acepto|prefiero otra|no me parece)\b/i.test(x.trim());
function ultimaPregunta(s){return [...(Array.isArray(s.mensajes)?s.mensajes:[])].reverse().find(m=>m.rol==='agente')?.texto||'';}
function sugerencia(q){const d=q.disponibilidad;const p=d.planes?.[0];return repartoSugerido(q.cantidad,d.disponibles,d.planificadas,p?fecha(p.fecha_disponibilidad):null);}
function informacionStock(q, s){
  let m=`Consulté el ERP simulado: hay ${s.inmediato} cajas liberadas de ${q.producto_nombre}.`;
  if(s.faltante>0){m+=` Para completar ${q.cantidad}, faltan ${s.faltante}.`;
    if(s.futuro>0&&s.fecha2)m+=` El plan PP-PI prevé ${s.futuro} cajas desde el ${s.fecha2}, sujetas a producción, liberación de Calidad y logística.`;
    if(s.sin_cobertura>0)m+=` Aún quedan ${s.sin_cobertura} cajas sin cobertura programada; sería necesario consultar Planeamiento.`;
  }
  return m;
}
async function encontrarSesion(id,idCliente){
 if(id&&/^[a-f0-9-]{36}$/i.test(id)){
  const s=await uno('SELECT * FROM conversaciones WHERE id_conversacion=$1 AND id_cliente=$2',[id,idCliente]);
  if(s)return s;
 }
 return uno('INSERT INTO conversaciones(id_cliente) VALUES($1) RETURNING *',[idCliente]);
}
async function atender(req,res){
 try {
  metodo(req,['POST']);revisarAcceso(req);
  const texto=obligatorio(req.body?.mensaje,'Mensaje',1200);
  const idCliente=req.body?.id_cliente;
  const contexto=await contextoCliente(idCliente);
  const sesion=await encontrarSesion(req.body?.id_conversacion,idCliente);
  const qid=req.body?.id_cotizacion||sesion.id_cotizacion;
  let q=qid?await detalleCotizacion(qid).catch(()=>null):null;
  if(q&&q.id_cliente!==idCliente)falla('Cotización de otro cliente.',403);
  const interpretacion=await interpretar(texto,{cliente:contexto.cliente.razon_social,credito:contexto.cliente.linea_credito,fecha_hoy:fechaLimaHoy(),cotizacion:q?{producto:q.producto_nombre,cantidad:q.cantidad,descuento:q.descuento_pct,estado:q.estado,entrega_aceptada:q.entrega_aceptada,pago:q.forma_pago,fecha_propuesta:q.entregas}:null,historial:Array.isArray(sesion.mensajes)?sesion.mensajes:[]});
  const anterior=ultimaPregunta(sesion);
  let mensaje='',observacion='';
  let accion=interpretacion.accion;
  // Evitar que el modelo interprete un «sí» o «no» como una nueva operación comercial.
  if(/\b(confirmo|confirmar|registrar) (?:el |mi )?pedido\b/i.test(texto))accion='confirmar';
  else if(/\b(?:pago|pagar|pagar[eé]|prefiero pagar|quiero pagar|lo pago|a)\s+(?:a\s+)?(?:el\s+)?cr[eé]dito\b/i.test(texto) && !/\b(solicitar|aumentar|ampliar)\b/i.test(texto))accion='pago';
  else if(soySi(texto))accion='aceptar';
  else if(esNegativa(texto))accion='rechazar';
  // Nunca registrar un pedido porque Groq interpretó «confirmo la entrega» como «confirmar pedido».
  if(accion==='confirmar' && !/\bpedido\b/i.test(texto))accion='aceptar';
  if(q&&!/cambiar (?:la )?cantidad total/i.test(texto)&&/\b(primero|segundo|despu[eé]s|fraccionad[ao]|dos partes|dos entregas)\b/i.test(texto))accion='entrega';
  try{
    switch(accion){
      case 'catalogo':
        mensaje='¡Claro! Tenemos leche UHT entera 1 L, evaporada 410 g y fresca 1 L. Puedes abrir Productos para ver las imágenes y precios. ¿Cuál necesitas y cuántas cajas?';break;
      case 'cotizar':case 'cantidad':{
        if(!interpretacion.cantidad){mensaje='¿Cuántas cajas necesitas? Dime también si prefieres UHT, evaporada o fresca.';break;}
        if(!interpretacion.producto&&!q){mensaje=`Perfecto, ${interpretacion.cantidad} cajas. ¿De qué tipo de leche: UHT, evaporada o fresca?`;break;}
        const prod=interpretacion.producto||q.id_producto;
        q=(q&&q.estado!=='CONFIRMADA')?await modificarCotizacion(q.id_cotizacion,{id_producto:prod,cantidad:interpretacion.cantidad}):await crearCotizacion(idCliente,prod,interpretacion.cantidad);
        mensaje=`Perfecto, anoté ${q.cantidad} cajas de ${q.producto_nombre}. La cotización es preliminar y aún no genera un pedido. ¿Para qué fecha quieres recibirlas?`;
        observacion='Cotización preliminar, sin promesa de entrega';break;
      }
      case 'consultar':{
        const tema=interpretacion.tema_consulta||(/jefatura|descuento/i.test(texto)?'descuento':/finanzas|cr[eé]dito/i.test(texto)?'credito':'general');
        mensaje=estadoComercial({q,contexto,tema});observacion='Consulta de estados reales de esta simulación';break;
      }
      case 'descuento':{
        if(!q){mensaje='Primero necesitamos un producto y una cantidad para calcular el descuento. ¿Qué leche deseas cotizar?';break;}
        if(interpretacion.descuento_pct==null){mensaje=`Puedo ofrecer hasta un 5% sujeto al margen mínimo; si solicitas más, Jefatura Comercial evalúa hasta el 12%. ¿Qué porcentaje deseas?`;break;}
        const r=await solicitarDescuento(q.id_cotizacion,interpretacion.descuento_pct);
        q=r.cotizacion;mensaje=`${r.mensaje}\n${siguientePaso(q)}`;observacion='Descuento validado por reglas, y Jefatura si corresponde';break;
      }
      case 'entrega':{
        if(!q){mensaje='Para hablar de entregas primero dime qué leche y cuántas cajas necesitas.';break;}
        const s=sugerencia(q);
        // Ofrece alternativas comerciales si el cliente solicita una fecha anterior a la cobertura PP-PI.
        if(interpretacion.primera_cantidad&&interpretacion.primera_fecha&&interpretacion.segunda_fecha){
          const r=await proponerEntrega(q.id_cotizacion,{modo:'PERSONALIZADA',partes:[{cajas:interpretacion.primera_cantidad,fecha:interpretacion.primera_fecha},{cajas:q.cantidad-interpretacion.primera_cantidad,fecha:interpretacion.segunda_fecha}]});
          q=r.cotizacion;mensaje=`${r.mensaje}\n${siguientePaso(q)}`;break;
        }
        if(interpretacion.modo_entrega==='DOS_PARTES'){
          if(s.sin_cobertura>0){mensaje=`${informacionStock(q,s)} No puedo completar las ${q.cantidad} con el plan actual. ¿Quieres reducir la cantidad o consultar una nueva programación?`;break;}
          const r=await proponerEntrega(q.id_cotizacion,{modo:'DOS_PARTES'});
          q=r.cotizacion;mensaje=`${r.mensaje}\n${siguientePaso(q)}`;observacion='Propuesta de dos partes, no despacho confirmado';break;
        }
        if(interpretacion.fecha_deseada){
          const fechaSolicitada=interpretacion.fecha_deseada;
          if(fechaSolicitada<fechaLimaHoy()){mensaje='La fecha que indicas ya pasó. ¿Qué otra fecha deseas?';break;}
          if(s.sin_cobertura>0){mensaje=`${informacionStock(q,s)} No puedo prometer el pedido completo para el ${fechaSolicitada}; requerimos revisar Planeamiento. ¿Aceptas una entrega parcial o deseas cambiar la cantidad?`;break;}
          if(s.faltante>0&&s.fecha2&&fechaSolicitada<s.fecha2){
            mensaje=`Para el ${fechaSolicitada} no llegamos a las ${q.cantidad} cajas. ${informacionStock(q,s)} ¿Prefieres recibir ${s.inmediato} primero y ${s.faltante} después de producción, o recibir todo junto en una fecha posterior al ${s.fecha2}?`;
            observacion='Excepción de stock, fechas propuestas sin confirmación logística';break;
          }
          const r=await proponerEntrega(q.id_cotizacion,{modo:'TODO_DESPUES',fecha:fechaSolicitada});
          q=r.cotizacion;mensaje=`${r.mensaje}\n${siguientePaso(q)}`;observacion='Fecha pedida por cliente, validada con stock y PP-PI';break;
        }
        if(interpretacion.modo_entrega==='TODO_DESPUES'){
          if(s.sin_cobertura>0){mensaje=`${informacionStock(q,s)} Para entregar todas las cajas juntas necesitamos consultar Planeamiento.`;break;}
          const r=await proponerEntrega(q.id_cotizacion,{modo:'TODO_DESPUES'});
          q=r.cotizacion;mensaje=`${r.mensaje}\n${siguientePaso(q)}`;break;
        }
        if(/\b(primero|despu[eé]s|dos entregas|dos partes)\b/i.test(texto)&&/\b\d+\b/.test(texto)){
          mensaje='Entiendo que quieres dividir la entrega. ¿Qué fechas prefieres para la primera y segunda parte? Podemos ajustarlas al stock y a la producción.';break;
        }
        if(q.entregas?.length){mensaje=estadoComercial({q,contexto,tema:'entrega'})+' Si deseas cambiar las fechas, indícame las nuevas.';break;}
        mensaje=`¿Para qué fecha necesitas ${q.cantidad} cajas? ${s.faltante?`Actualmente hay ${s.inmediato} liberadas y ${s.faltante} faltantes; si deseas, puedo ofrecer una entrega en dos partes.`:'Hay stock liberado suficiente para evaluar tu solicitud.'}`;
        break;
      }
      case 'pago':{
        if(!q){mensaje='Primero dime producto y cantidad para calcular el importe de compra.';break;}
        if(!interpretacion.modalidad){mensaje='¿Prefieres contado, crédito aprobado o anticipo del 40% con saldo del 60% (simulado)?';break;}
        const r=await definirPago(q.id_cotizacion,interpretacion.modalidad);
        q=r.cotizacion;mensaje=`${r.mensaje}\n${siguientePaso(q)}`;break;
      }
      case 'credito':
        mensaje=estadoComercial({q,contexto,tema:'credito'})+' Si quieres solicitar o ampliar una línea, usa Clientes → Solicitar crédito a Finanzas. Finanzas puede ofrecer menos y tú decides si aceptas.';break;
      case 'aceptar':{
        const solicitud=pendientesDescuento(q);
        const ofertaCredito=contexto.creditos?.find(c=>c.estado==='OFERTADO');
        const explicitoDescuento=/\b(descuento|jefatura|porcentaje)\b/i.test(texto);
        const explicitoCredito=/\b(cr[eé]dito|finanzas|l[ií]nea)\b/i.test(texto);
        const explicitoEntrega=/\b(entrega|partes|fechas|despacho|propuesta)\b/i.test(texto);
        const explicitoDireccion=/direcci[oó]n/i.test(texto);
        const ambiguo=soySi(texto)&&!explicitoCredito&&!explicitoDescuento&&!explicitoEntrega&&!explicitoDireccion;
        if(solicitud?.estado==='OFERTADO'&&(explicitoDescuento||(ambiguo&&/jefatura|descuento|porcentaje/i.test(anterior)))){
          const r=await clienteRespondeDescuento(solicitud.id_solicitud,true);q=r.cotizacion;mensaje=`${r.mensaje}\n${siguientePaso(q)}`;break;
        }
        if(ofertaCredito&&(explicitoCredito||(ambiguo&&/finanzas|cr[eé]dito|l[ií]nea/i.test(anterior)))){
          const r=await clienteRespondeCredito(ofertaCredito.id_solicitud,true);mensaje=r.mensaje;contexto.cliente.linea_credito=ofertaCredito.monto_ofrecido;contexto.cliente.plazo_credito_dias=ofertaCredito.plazo_ofrecido;break;
        }
        if(q?.entregas?.length&&!q.entrega_aceptada&&(explicitoEntrega||(ambiguo&&/aceptas|propuesta de entrega|entrega|fechas/i.test(anterior)))){
          const r=await aceptarEntrega(q.id_cotizacion,true);q=r.cotizacion;mensaje=`${r.mensaje}\n${siguientePaso(q)}`;break;
        }
        if(q&&!q.direccion_confirmada&&(explicitoDireccion||(ambiguo&&/confirmas.*direcci[oó]n/i.test(anterior)))){
          const r=await confirmarDireccion(q.id_cotizacion,q.id_direccion);q=r.cotizacion;mensaje=`${r.mensaje}\n${siguientePaso(q)}`;break;
        }
        mensaje=q?siguientePaso(q):'¡De acuerdo! ¿Qué leche y cuántas cajas quieres cotizar?';break;
      }
      case 'rechazar':{
        const sd=pendientesDescuento(q);
        const ofertaCredito=contexto.creditos?.find(x=>x.estado==='OFERTADO');
        if(sd?.estado==='OFERTADO'&&/descuento|jefatura|porcentaje/i.test(texto+' '+anterior)){
          const r=await clienteRespondeDescuento(sd.id_solicitud,false);mensaje=`${r.mensaje} ¿Qué descuento te gustaría negociar ahora?`;break;
        }
        if(ofertaCredito&&/cr[eé]dito|finanzas|l[ií]nea/i.test(texto+' '+anterior)){
          const r=await clienteRespondeCredito(ofertaCredito.id_solicitud,false);mensaje=r.mensaje;break;
        }
        mensaje='Entendido, podemos cambiar la fecha, cantidades, descuento o forma de pago. ¿Qué prefieres modificar?';break;
      }
      case 'direccion':{
        if(!q){mensaje='Primero necesitamos una cotización para elegir el lugar de entrega.';break;}
        const t=texto.toLowerCase();
        const opc=contexto.direcciones?.find(x=>t.includes(x.distrito.toLowerCase())||t.includes(x.direccion.toLowerCase()));
        if(!opc){mensaje=`Tus direcciones registradas son: ${(contexto.direcciones||[]).map(x=>`${x.direccion}, ${x.distrito}`).join(' / ')}. ¿Cuál confirmamos?`;break;}
        const r=await confirmarDireccion(q.id_cotizacion,opc.id_direccion);q=r.cotizacion;mensaje=`${r.mensaje}\n${siguientePaso(q)}`;break;
      }
      case 'confirmar':{
        if(!q){mensaje='Primero necesitamos preparar y negociar una cotización.';break;}
        if(!resumenHabilitado(q)||q.estado==='CONFIRMADA'){mensaje=q.estado==='CONFIRMADA'?'Este pedido ya fue registrado.':`Todavía no puedo confirmarlo. ${siguientePaso(q)}`;break;}
        const r=await confirmarPedido(q.id_cotizacion);mensaje=r.mensaje;observacion='ERP revalidó stock, crédito y aprobaciones; pedido dentro de la simulación';break;
      }
      default:
        mensaje=interpretacion.respuesta_libre||'Entendido. ¿En qué más puedo ayudarte?';
    }
  }catch(err){if(Number(err?.status)>=500)throw err;mensaje=`No pude completar esa operación: ${err.message} ${q?siguientePaso(q):'Dime qué necesitas cotizar.'}`;}
  if(q?.id_cotizacion)q=await detalleCotizacion(q.id_cotizacion);
  const ahora=()=>new Date().toISOString();
  const mensajes=[...(Array.isArray(sesion.mensajes)?sesion.mensajes:[]),{rol:'cliente',texto,fecha:ahora()},{rol:'agente',texto:mensaje,fecha:ahora(),motor:interpretacion.motor,observacion}].slice(-60);
  await consulta('UPDATE conversaciones SET mensajes=$2::jsonb,id_cotizacion=$3,actualizado_en=now() WHERE id_conversacion=$1',[sesion.id_conversacion,JSON.stringify(mensajes),q?.id_cotizacion||null]);
  respuesta(res,200,{ok:true,id_conversacion:sesion.id_conversacion,mensajes,respuesta:mensaje,cotizacion:q,motor:interpretacion.motor,observacion});
 }catch(err){errorJson(res,err);}
}
export default async function handler(req,res){try{await enSimulacion(req,()=>atender(req,res));}catch(err){errorJson(res,err);}}
