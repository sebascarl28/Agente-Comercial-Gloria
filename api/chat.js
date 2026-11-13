import {respuesta,errorJson,revisarAcceso,metodo,falla,obligatorio} from '../lib/http.js';
import {consulta,uno} from '../lib/db.js';
import {interpretar} from '../lib/ai.js';
import {contextoCliente,crearCotizacion,modificarCotizacion,detalleCotizacion,solicitarDescuento,proponerEntrega,confirmarDireccion,definirPago,confirmarPedido,clienteRespondeDescuento,clienteRespondeCredito,aceptarEntrega,disponibilidad} from '../lib/service.js';
import {repartoSugerido,fechaLimaHoy} from '../lib/rules.js';
function fecha(x){return typeof x==='string'?x:x?new Date(x).toISOString().slice(0,10):null;}
async function encontrarSesion(id,id_cliente){
  if(id&&/^[a-f0-9-]{36}$/i.test(id)){
    const s=await uno('SELECT * FROM conversaciones WHERE id_conversacion=$1 AND id_cliente=$2',[id,id_cliente]);
    if(s)return s;
  }
  return uno('INSERT INTO conversaciones(id_cliente) VALUES($1) RETURNING *',[id_cliente]);
}
function fechaMensaje(){return new Date().toISOString();}
export default async function handler(req,res){
  try{
    metodo(req,['POST']);revisarAcceso(req);
    const texto=obligatorio(req.body?.mensaje,'Mensaje',1200);
    const id_cliente=req.body?.id_cliente;
    const contexto=await contextoCliente(id_cliente);
    const sesion=await encontrarSesion(req.body?.id_conversacion,id_cliente);
    const qid=req.body?.id_cotizacion||sesion.id_cotizacion;
    let q=qid?await detalleCotizacion(qid).catch(()=>null):null;
    if(q&&q.id_cliente!==id_cliente)falla('La cotización no corresponde al cliente activo.',403);
    const interpretacion=await interpretar(texto,{cliente:contexto.cliente.razon_social,credito:contexto.cliente.linea_credito,cotizacion:q?{producto:q.producto_nombre,cantidad:q.cantidad,descuento:q.descuento_pct,estado:q.estado}:null});
    let mensaje='',resultado=null,observacion='';
    try{
      switch(interpretacion.accion){
        case 'catalogo':
          mensaje='Tenemos leche UHT entera, evaporada y fresca. Puedes entrar a Productos para ver presentaciones y precios, o decirme cuántas cajas necesitas.';break;
        case 'cotizar':case 'cantidad':{
          if(!interpretacion.cantidad){mensaje='¡Claro! ¿Cuántas cajas necesitas? Puedes indicarme también el tipo de leche.';break;}
          const prod=interpretacion.producto||q?.id_producto||'PRD-001';
          resultado=q?await modificarCotizacion(q.id_cotizacion,{id_producto:prod,cantidad:interpretacion.cantidad}):await crearCotizacion(id_cliente,prod,interpretacion.cantidad);
          q=resultado;
          const d=q.disponibilidad;const s=repartoSugerido(q.cantidad,d.disponibles,d.planificadas,d.planes[0]?fecha(d.planes[0].fecha_disponibilidad):null);
          mensaje=`Preparé la cotización V${q.version}: ${q.cantidad} cajas de ${q.producto_nombre}, total referencial S/ ${Number(q.total).toFixed(2)} con IGV. `;
          mensaje+=s.faltante?`Tenemos ${s.inmediato} cajas liberadas y faltan ${s.faltante}. ${s.cubierto?`El plan de producción contempla ${s.futuro} adicionales disponibles tentativamente desde ${s.fecha2}, después de Calidad. ¿Prefieres recibir el pedido en partes o todo después?`:'No hay producción programada suficiente para cubrir el faltante; debo consultar Planeamiento.'}`:`Hay stock liberado suficiente (${d.disponibles} cajas). Podemos proponer fechas de entrega.`;
          observacion='Consulta ERP: stock de lotes liberados y plan PP-PI';break;
        }
        case 'descuento':{
          if(!q && interpretacion.cantidad){q=await crearCotizacion(id_cliente,interpretacion.producto||'PRD-001',interpretacion.cantidad);}
          if(!q){mensaje='Primero necesitamos cotizar un producto y su cantidad, para evaluar el descuento con el margen real.';break;}
          if(interpretacion.descuento_pct==null){mensaje='¿Qué porcentaje de descuento deseas solicitar? Puedo ofrecer hasta 5 %; Jefatura Comercial evalúa solicitudes de hasta 12 % según margen.';break;}
          resultado=await solicitarDescuento(q.id_cotizacion,interpretacion.descuento_pct);
          mensaje=resultado.mensaje; q=resultado.cotizacion;observacion='Política de descuentos: Agente <=5 %, Jefatura <=12 % y margen mínimo';break;
        }
        case 'pago':{
          if(!q){mensaje='Primero indicamos producto y cantidad para calcular las condiciones de pago.';break;}
          if(!interpretacion.modalidad){mensaje='Puedes pagar al contado, con crédito aprobado o con anticipo de demostración (40 % inicial y 60 % contraentrega). ¿Cuál prefieres?';break;}
          resultado=await definirPago(q.id_cotizacion,interpretacion.modalidad);q=resultado.cotizacion;mensaje=resultado.mensaje;break;
        }
        case 'entrega':{
          if(!q){mensaje='¿Qué producto y cuántas cajas necesitas? Así podré verificar fechas de entrega.';break;}
          if(interpretacion.fecha_deseada){resultado=await proponerEntrega(q.id_cotizacion,{modo:'TODO_DESPUES',fecha:interpretacion.fecha_deseada});}
          else if(interpretacion.primera_cantidad&&interpretacion.primera_fecha&&interpretacion.segunda_fecha){
            resultado=await proponerEntrega(q.id_cotizacion,{modo:'PERSONALIZADA',partes:[{cajas:interpretacion.primera_cantidad,fecha:interpretacion.primera_fecha},{cajas:q.cantidad-interpretacion.primera_cantidad,fecha:interpretacion.segunda_fecha}]});
          } else {const d=q.disponibilidad;const s=repartoSugerido(q.cantidad,d.disponibles,d.planificadas,d.planes[0]?fecha(d.planes[0].fecha_disponibilidad):null);mensaje=s.faltante?`Puedo proponerte ${s.inmediato} cajas primero y ${s.futuro} tras producción prevista ${s.fecha2}. Puedes elegir «Proponer dos entregas» o indicarme una fecha para recibirlas juntas.`:`Hay stock suficiente. Puedes indicarme tu fecha deseada o solicitar entregas parciales voluntarias.`;break;}
          q=resultado.cotizacion;mensaje=resultado.mensaje;observacion='Propuesta de fechas sujeta a validación QM y logística';break;
        }
        case 'credito':
          mensaje=Number(contexto.cliente.linea_credito)>0?`Tu empresa tiene una línea aprobada de S/ ${Number(contexto.cliente.linea_credito).toFixed(2)} a ${contexto.cliente.plazo_credito_dias} días. Si necesitas ampliarla, puedes solicitar una evaluación a Finanzas desde Clientes.`:'Puedes comprar al contado o solicitar una línea de crédito inicial desde Clientes. Finanzas evaluará la solicitud y tú decides si aceptas el monto ofrecido.';break;
        case 'aceptar':{
          const s=await uno(`SELECT * FROM solicitudes_descuento WHERE id_cotizacion=$1 AND estado='OFERTADO' ORDER BY creado_en DESC LIMIT 1`,[q?.id_cotizacion||null]);
          if(s){resultado=await clienteRespondeDescuento(s.id_solicitud,true);q=resultado.cotizacion;mensaje=resultado.mensaje;break;}
          const cred=await uno(`SELECT * FROM solicitudes_credito WHERE id_cliente=$1 AND estado='OFERTADO' ORDER BY creado_en DESC LIMIT 1`,[id_cliente]);
          if(cred){resultado=await clienteRespondeCredito(cred.id_solicitud,true);mensaje=resultado.mensaje;break;}
          if(q&&!q.direccion_confirmada){resultado=await confirmarDireccion(q.id_cotizacion,q.id_direccion);q=resultado.cotizacion;mensaje=resultado.mensaje;break;}
          if(q&&q.entregas?.length&&!q.entrega_aceptada){resultado=await aceptarEntrega(q.id_cotizacion,true);q=resultado.cotizacion;mensaje=resultado.mensaje;break;}
          mensaje='Entendido. Para registrar el pedido, cuando estén listas las condiciones, utiliza «Confirmar pedido» o escribe «confirmar pedido».';break;
        }
        case 'rechazar':{
          const s=await uno(`SELECT * FROM solicitudes_descuento WHERE id_cotizacion=$1 AND estado='OFERTADO' ORDER BY creado_en DESC LIMIT 1`,[q?.id_cotizacion||null]);
          if(s){resultado=await clienteRespondeDescuento(s.id_solicitud,false);mensaje=resultado.mensaje;break;}
          const cred=await uno(`SELECT * FROM solicitudes_credito WHERE id_cliente=$1 AND estado='OFERTADO' ORDER BY creado_en DESC LIMIT 1`,[id_cliente]);
          if(cred){resultado=await clienteRespondeCredito(cred.id_solicitud,false);mensaje=resultado.mensaje;break;}
          mensaje='De acuerdo. Podemos modificar cantidades, fechas, forma de pago o solicitar otra cotización.';break;
        }
        case 'confirmar':{
          if(!q){mensaje='Primero necesitamos preparar y revisar una cotización.';break;}
          resultado=await confirmarPedido(q.id_cotizacion);mensaje=resultado.mensaje;observacion='ERP revalidó stock, producción, crédito y descuentos antes de registrar pedido';break;
        }
        default:mensaje=interpretacion.respuesta_libre||`¡Hola! Soy el Agente Comercial Gloria. Puedo ayudarte con productos de leche, cotizaciones, entregas, crédito y descuentos. ¿Qué necesitas hoy?`;
      }
    }catch(err){if(Number(err?.status)>=500)throw err;mensaje=`No pude completar esa operación: ${err.message} Podemos ajustar las condiciones antes de confirmar.`;}
    if(q?.id_cotizacion)q=await detalleCotizacion(q.id_cotizacion);
    const mensajes=[...(Array.isArray(sesion.mensajes)?sesion.mensajes:[]),{rol:'cliente',texto,fecha:fechaMensaje()},{rol:'agente',texto:mensaje,fecha:fechaMensaje(),motor:interpretacion.motor,observacion}].slice(-60);
    await consulta('UPDATE conversaciones SET mensajes=$2::jsonb,id_cotizacion=$3,actualizado_en=now() WHERE id_conversacion=$1',[sesion.id_conversacion,JSON.stringify(mensajes),q?.id_cotizacion||null]);
    respuesta(res,200,{ok:true,id_conversacion:sesion.id_conversacion,mensajes,respuesta:mensaje,cotizacion:q,motor:interpretacion.motor,observacion});
  }catch(err){errorJson(res,err);}
}
