// Reglas conversacionales deterministas: una petición de stock o una confirmación
// explícita nunca debe depender únicamente de la clasificación del modelo.
import {fechaEscrita,temaConsulta} from './ai.js';
import {fechaValida,sumarDias} from './rules.js';

export function normalizar(x='') {
  return String(x).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
}
export function detectarProducto(texto='') {
  const m=normalizar(texto);
  if(/\b(evaporad[ao]?|evaporada|evaporda|evapora|evaporrada|evapordo)\b/.test(m))return {id:'PRD-002',correccion:/\b(evaporda|evapora|evaporrada|evapordo)\b/.test(m)};
  if(/\b(fresc[ao]|fresaca|freca|freska|frsca|fresqa)\b/.test(m))return {id:'PRD-003',correccion:/\b(fresaca|freca|freska|frsca|fresqa)\b/.test(m)};
  if(/\b(uht|uth|uthd|uhtd|uhtt|uhd|uhtl|leche de larga vida)\b/.test(m))return {id:'PRD-001',correccion:/\b(uth|uthd|uhtd|uhtt|uhd|uhtl)\b/.test(m)};
  if(/\b(entera|larga vida)\b/.test(m))return {id:'PRD-001',correccion:false};
  return null;
}
export function productoExplicito(texto='') {return detectarProducto(texto)?.id||null;}
export function pideAgregarProducto(texto=''){
  const m=normalizar(texto);
  return /\b(?:anadir|anade|agregar|agrega|sumar|suma|incluir|incluye|tambien quiero|ademas quiero|otro producto|otra leche)\b/.test(m)
    && !/\b(?:quitar|eliminar|reemplazar|cambiar por)\b/.test(m);
}
export function pideQuitarProducto(texto=''){
  return /\b(?:quitar|quita|eliminar|sacar|saca|retirar|retira|ya no quiero|borra)\b/.test(normalizar(texto));
}
export function preguntaFechaAmbigua(texto='') {
  const m=normalizar(texto);
  return /\b(?:hasta cuando (?:tienen|hay|la tienen)|que fecha tiene|cual es la fecha|hasta que fecha)\b/.test(m)
    && !/\b(?:vencim|caduc|entrega|despacho|produc|llega)\b/.test(m);
}
export function preguntaVencimiento(texto='') {return /\b(?:vencimiento|vence|vencen|caduca|caducidad|expira|expiracion)\b/.test(normalizar(texto));}

export function cantidadExplicita(texto='',esperabaCantidad=false) {
  const m=normalizar(texto);
  let a=m.match(/\b(\d{1,5})\s*(?:cajas?|cajitas|cj|unidades)\b/);
  if (!a) a=m.match(/\b(?:necesito|quiero|dame|pedir|comprar|cotiza|cotizar|llevare|llevar)\s+(?:unas?|las?|aproximadamente)?\s*(\d{1,5})(?!\s*%)(?:\s|$)/);
  if (!a && esperabaCantidad) a=m.match(/^(\d{1,5})$/);
  const n=a?Number(a[1]):null;
  return Number.isInteger(n)&&n>=1&&n<=10000?n:null;
}
export function esConsultaStock(texto='') {
  const m=normalizar(texto);
  if(/\b(todo el stock|todo tu stock|todo lo disponible|todo el inventario|todas las cajas disponibles)\b/.test(m) && /\b(quiero|llevar|pedir|comprar|dame|necesito)\b/.test(m)) return false;
  return /\b(stock|inventario|existencias|disponibilidad|disponibles?|cuantas? (?:cajas|tienes|tienen|quedan)|cuanto (?:tienes|hay|queda))\b/.test(m);
}
export function esTodoStock(texto='') {
  const m=normalizar(texto);
  return /\b(todo (?:el |tu |su )?stock|todo lo disponible|todas las cajas disponibles|todo (?:el |su )?inventario)\b/.test(m)
    && /\b(quiero|llevar|pedir|comprar|dame|necesito|cotiza)\b/.test(m);
}
export function cantidadesParciales(texto='') {
 const m=normalizar(texto);
 if(!/\b(primero|primera|antes|ahora)\b/.test(m)||!/\b(despues|luego|segunda|resto)\b/.test(m))return null;
 // Las fechas se tratan por separado; no confundir 17/11 con número de cajas.
 const sinFechas=m.replace(/\b\d{1,2}[\/-]\d{1,2}(?:[\/-]20\d\d)?\b/g,'');
 const n=[...sinFechas.matchAll(/\b(\d{1,5})(?:\s*cajas?)?\b/g)].map(x=>Number(x[1]));
 if(n.length!==2||n.some(x=>x<1||x>10000))return null;
 return n;
}
export function esAfirmacion(texto='') {return /^(?:s[ií](?:[,!. ]|$)|acepto\b|de acuerdo\b|esta bien\b|me parece bien\b|confirmo\b|ok\b|correcto\b|claro\b|asi nomas\b|listo asi\b)/i.test(normalizar(texto));}
// Una respuesta corta afirmativa no puede convertirse en aceptación de una
// reducción de unidades si el cliente solo dijo "sí, una entrega parcial".
export function esConfirmacionCorta(texto='') {
  return /^(?:si(?:,? (?:esta bien|estabien|de acuerdo|acepto|confirmo))?|acepto|confirmo|claro|de acuerdo|correcto|ok|listo|esta bien|perfecto)[!.,\s]*$/.test(normalizar(texto));
}
// Un "sí" solo puede confirmar el tema de la última respuesta del agente.
// Si el cliente consultó stock entre medio, se debe repetir la propuesta final.
export function ultimaRespuestaPidePedido(texto='') {
  return /(?:confirmas el pedido con esas condiciones|confirmas el pedido luego de revisar el resumen)/.test(normalizar(texto));
}
export function ultimaRespuestaPideDescuento(texto='') {
  const m=normalizar(texto);
  return /aceptas ese descuento|falta que (?:tu|usted) lo aceptes|falta que lo aceptes|oferta de descuento.*aceptas/.test(m);
}
// Una fecha repetida NO es aceptación, pero tampoco justifica recalcular la entrega.
export function coincideFechaPropuesta(entregas=[],fechaSolicitada=null){
  return Boolean(fechaSolicitada && Array.isArray(entregas) && entregas.length>0
    && entregas.every(e=>String(e.fecha||'').slice(0,10)===String(fechaSolicitada).slice(0,10)));
}
export function esAceptacionEntrega(texto='') {
  const m=normalizar(texto);
  return /^(?:si,?\s*)?(?:acepto|confirmo|de acuerdo con)\s+(?:la |las |el |esa |esas )?(?:entrega|entregas|fechas|propuesta|reparto|esquema)\b/.test(m);
}
// Una aceptación con cantidades y fechas se valida contra la propuesta real.
// Evita que "340 para el 16 y 20 para el 17" modifique cantidades accidentalmente.
export function mencionaRepartoConAceptacion(texto='') {
  const m=normalizar(texto);
  return /^(?:si[,!\s]+)?(?:acepto|confirmo|de acuerdo|estoy de acuerdo)\b/.test(m)
    && /\b\d{1,5}\b/.test(m)
    && /\b(?:para\s+el|el|desde\s+el)\s+\d{1,2}\b/.test(m);
}
export function aceptaRepartoPropuesto(texto='',entregas=[]) {
  if(!mencionaRepartoConAceptacion(texto)||!Array.isArray(entregas)||!entregas.length)return false;
  const m=normalizar(texto);
  const patron=/\b(\d{1,5})\s*(?:cajas?)?(?:\s+(?:de\s+)?(?:leche\s+)?(?:evaporada|uht|fresca))?\s+(?:para\s+el|el|desde\s+el)\s+(\d{1,2})(?:[\/-](\d{1,2})(?:[\/-](20\d{2}))?)?\b/g;
  const mencionadas=[...m.matchAll(patron)].map(x=>({cajas:Number(x[1]),dia:Number(x[2]),mes:x[3]?Number(x[3]):null,anio:x[4]?Number(x[4]):null}));
  const agrupadas=new Map();
  for(const parte of entregas){
    const fecha=String(parte.fecha||'').slice(0,10);
    if(!/^20\d{2}-\d{2}-\d{2}$/.test(fecha)||!Number.isInteger(Number(parte.cajas)))return false;
    agrupadas.set(fecha,(agrupadas.get(fecha)||0)+Number(parte.cajas));
  }
  if(mencionadas.length!==agrupadas.size)return false;
  const pendientes=[...mencionadas];
  for(const [fecha,cajas] of agrupadas){
    const [anio,mes,dia]=fecha.split('-').map(Number);
    const i=pendientes.findIndex(x=>x.cajas===cajas&&x.dia===dia&&(x.mes===null||x.mes===mes)&&(x.anio===null||x.anio===anio));
    if(i<0)return false;
    pendientes.splice(i,1);
  }
  return pendientes.length===0;
}
export function esAceptacionDireccion(texto='') {
  const m=normalizar(texto);
  return /^(?:si,?\s*)?(?:acepto|confirmo|de acuerdo con)\s+(?:la |mi |esa |esta |nueva )?(?:nueva )?direccion\b/.test(m);
}
export function esAceptacionDescuento(texto='') {
  const m=normalizar(texto);
  return /^(?:si[,\s]+)?(?:acepto|aceptamos|confirmo|quiero aceptar|de acuerdo con|estoy de acuerdo con|me parece bien|esta bien)\b/.test(m)
    && /\b(?:descuento|oferta de jefatura|porcentaje)\b/.test(m)
    && !/\b(?:rechazo|no acepto|consultar)\b/.test(m);
}
export function confirmaReduccion(texto='', cantidadOfrecida) {
  const m=normalizar(texto);
  const n=Number(cantidadOfrecida);
  if(!Number.isInteger(n)||n<1) return false;
  if(/\b(?:entrega|parcial|partes|despacho|juntas?|completa)\b/.test(m) && !/\b(reduc|ajust|baj|cambi|solo)\b/.test(m)) return false;
  const accion=/\b(?:reducir|reduce|reduzcamos|ajustar|ajusta|dejemos|dejar|bajar|cambiar|quedarme|quedarnos)\b/.test(m);
  const explicito= new RegExp(`\\b${n}\\s*cajas?\\b|\\b(?:a|en|solo)\\s*${n}\\b`).test(m);
  return accion && explicito;
}
export function esNegacion(texto='') {return /^(?:no(?:\b|[,!. ])|rechazo\b|prefiero otra\b|no acepto\b)/i.test(normalizar(texto));}
export function esPagoCredito(texto='') {
 const m=normalizar(texto);
 return /\b(?:a credito|al credito|con credito|pago a credito|pagar a credito|quiero usar (?:el |mi )?credito|credito aprobado)\b/.test(m)
  && !/\b(?:ampliar|solicitar|aumentar|nuevo credito|linea de credito)\b/.test(m);
}
export function direccionPropuesta(texto='') {
 const m=normalizar(texto);
 if(!/\b(direccion|domicilio|calle|avenida|av\.|jir[oó]n|jr\.|distrito|vitarte|entrega en|envi(?:a|ar|alo) a)\b/.test(m))return null;
 if(/\b(?:cual|que|confirma|confirmas) (?:es |la |mi |su )?direccion\b/.test(m))return null;
 // Si solo nombra un distrito, se necesita aún la dirección exacta.
 const distrito=/\b(?:ate|vitarte)\b/.test(m)?'Ate':/\bsanta anita\b/.test(m)?'Santa Anita':null;
 const index=m.search(/\b(?:av\.|avenida|calle|jr\.|jiron|pasaje|psje\.?)\b/);
 const fragmento=index>=0?texto.slice(index).trim():null;
 return {distrito,direccion:fragmento?.slice(0,180)||null};
}
export function leerTurno(texto,{estado={},cotizacion=null,interpretacion={}}={}) {
 const m=normalizar(texto);
 const producto=productoExplicito(texto)||estado.producto||cotizacion?.id_producto||null;
 let fecha=fechaEscrita(texto,estado.hoy);
 if(!fecha){
   const corta=m.match(/\b([0-3]?\d)[\/-]([01]?\d)(?![\/-]\d)\b/);
   if(corta){const hoy=estado.hoy||new Date().toISOString().slice(0,10);const mes=corta[2].padStart(2,'0'),dia=corta[1].padStart(2,'0');
     let f=`${hoy.slice(0,4)}-${mes}-${dia}`;if(fechaValida(f)&&f<hoy)f=`${Number(hoy.slice(0,4))+1}-${mes}-${dia}`;fecha=fechaValida(f)?f:null;}
   else if(/\bdentro de una semana\b/.test(m)) fecha=sumarDias(estado.hoy,7);
 }
 const cantidad=cantidadExplicita(texto,['PEDIR_CANTIDAD','PEDIR_PRODUCTO','CANTIDAD_ADICIONAL'].includes(estado.esperando));
 const consulta=temaConsulta(texto);
 const modo=/\b(parcial|partes|fraccionad|primero|despues|dos entregas|dos partes)\b/.test(m)?'DOS_PARTES':/\b(complet[ao]s?|todo junto|todas juntas|junt[oa]s?|una sola entrega|de una vez)\b/.test(m)?'TODO_DESPUES':null;
 const pct=m.match(/\b(\d{1,2}(?:[.,]\d+)?)\s*%/);
 const descuentoPct=pct?Number(pct[1].replace(',','.')):null;
 const nombreCorregido=detectarProducto(texto)?.correccion||false;
 let accion=null;
 if(preguntaFechaAmbigua(texto))accion='ACLARAR_FECHA';
 else if(preguntaVencimiento(texto)||(/^vencimiento$/.test(m)&&estado.esperando==='ACLARAR_FECHA'))accion='VENCIMIENTO';
 else if(pideQuitarProducto(texto))accion='QUITAR_PRODUCTO';
 else if(pideAgregarProducto(texto))accion='AGREGAR_PRODUCTO';
 else if(consulta && !cantidad && !fecha && !/\b(quiero|dame|necesito|solicito)\s+\d/.test(m))accion='CONSULTAR';
 else if(esTodoStock(texto))accion='TODO_STOCK';
 else if((esConsultaStock(texto)||/\b(tienes|tienen|hay|alcanza|abastece|abastecer|pueden cubrir)\b/.test(m))&&cantidad&&!/\b(quiero (?:comprar|pedir|llevar)|necesito|cotiza|cotizar|dame)\b/.test(m))accion='STOCK_CANTIDAD';
 else if(esConsultaStock(texto)&&!cantidad)accion='STOCK';
 else if(/\b(confirmar|registrar) (?:el |mi )?pedido\b/.test(m))accion='CONFIRMAR_PEDIDO';
 else if(/\b(confirmo|confirmar) (?:la |mi )?direccion\b/.test(m))accion='SI';
 else if(modo && cotizacion && !/\b(?:modificar|cambiar)\s+(?:la\s+)?cantidad\s+total\b/.test(m))accion='ENTREGA';
 else if(cantidad && !(/\b(primero|segund[ao]|despues|dos partes|dos entregas)\b/.test(m)&&!/\b(cambiar|modificar) (?:la )?cantidad total\b/.test(m)) && (/(?:cajas?|comprar|pedir|cotiza|cotiz|quiero|necesito|dame|llevar)/.test(m)||estado.esperando==='PEDIR_CANTIDAD'))accion='CANTIDAD';
 else if(/\b(?:sin descuento|no quiero descuento|no necesito descuento|ningun descuento)\b/.test(m))accion='SIN_DESCUENTO';
 else if(/\b(descuento|rebaja|porcentaje)\b/.test(m)||descuentoPct!==null)accion='DESCUENTO';
 else if(/\b(ampliar|solicitar|aumentar)\b.*\b(cr[eé]dito|linea)\b/.test(m))accion='CREDITO';
 else if(esPagoCredito(texto))accion='PAGO';
 else if(/\b(contado|anticipo|pagar|forma de pago)\b/.test(m))accion='PAGO';
 else if(direccionPropuesta(texto))accion='DIRECCION';
 else if(fecha)accion='FECHA';
 else if(modo)accion='ENTREGA';
 else if(esAfirmacion(texto))accion='SI';
 else if(esNegacion(texto))accion='NO';
 else if(productoExplicito(texto))accion='PRODUCTO';
 else if(/\b(esta semana|la proxima semana|proxima semana|lo mas pronto|cuanto antes)\b/.test(m))accion='FECHA_RELATIVA';
 else accion=({catalogo:'CATALOGO',cotizar:'CANTIDAD',cantidad:'CANTIDAD',entrega:'ENTREGA',pago:'PAGO',credito:'CREDITO',consultar:'CONSULTAR',aceptar:'SI',rechazar:'NO',descuento:'DESCUENTO',confirmar:'CONFIRMAR_PEDIDO',direccion:'DIRECCION',conversar:'CONVERSAR'}[interpretacion.accion]||'CONVERSAR');
 // Si no se mencionó un producto nuevo, respetar el de la negociación incluso cuando
 // Groq adivinó otro a partir de una referencia vaga como «leche Gloria».
 return {accion,producto,cantidad,fecha,modo,consulta,descuentoPct,partes:cantidadesParciales(texto),direccion:direccionPropuesta(texto),
   pago:esPagoCredito(texto)?'CREDITO':/\bcontado\b/.test(m)?'CONTADO':/\banticipo\b/.test(m)?'ANTICIPO':interpretacion.modalidad||null,
   parte1:interpretacion.primera_cantidad||null,fecha1:interpretacion.primera_fecha||null,fecha2:interpretacion.segunda_fecha||null,
   textoNormalizado:m,nombreCorregido};
}
export function estadoAnterior(mensajes=[]) {
  for(let i=mensajes.length-1;i>=0;i--)if(mensajes[i]?.rol==='agente'&&mensajes[i]?.estado_chat)return {...mensajes[i].estado_chat};
  return {};
}
