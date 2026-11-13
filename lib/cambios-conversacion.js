import {normalizar,esConsultaStock} from './dialogo.js';
import {extraerProductos} from './seleccion-productos.js';

const nombres={'PRD-001':'UHT entera','PRD-002':'evaporada','PRD-003':'fresca'};
const describir=items=>items.map(x=>`${x.cantidad} cajas de ${nombres[x.id]}`).join(' y ');

// Conserva una propuesta ambigua hasta que el cliente aclare si suma o sustituye.
// Nunca se confirma un pedido ni se cambia una cotización ya confirmada.
export function interpretarCambio(texto,estado={},q=null,interpretacion={}){
  if(!q || q.estado==='CONFIRMADA')return null;
  const m=normalizar(texto), previo=estado.cambio_multi;
  // Una corrección de cantidad tiene prioridad sobre «ya no quiero» (retirar).
  const productos=extraerProductos(texto);
  const reemplazo=/\b(?:modificar|modifica|cambiar|cambia|disminuir|disminuye|reducir|reduce|aumentar|aumenta|ajustar|ajusta|en vez|sino)\b/.test(m)||/\bya no\b.*\bquiero\b.*\bquiero\b/.test(m);
  if(reemplazo && productos.length<=1 && !/\b(?:fecha|noviembre|diciembre|entrega|descuento)\b|%|\d[/-]\d/.test(m)){
    const numeros=[...m.matchAll(/\b(\d{1,5})\b/g)].map(x=>Number(x[1]));
    const id=productos[0]?.id||(q.items?.length===1?q.items[0].id_producto:null);
    if(numeros.length>=1 && numeros.length<=2 && numeros.every(n=>n>=1&&n<=10000)){
      if(!id)return {mensaje:'Claro, ¿de qué leche quieres cambiar la cantidad? Indica la variedad y cuántas cajas deseas en total.'};
      if(q.items?.some(x=>x.id_producto===id) && !productos[0]?.correccion){
        delete estado.cambio_multi;
        return {operaciones:[{id,cantidad:numeros.at(-1)}],modo:'FIJAR',version:q.version};
      }
    }
  }

  if(previo){
    if(/^(?:cancelar|cancela|no|olvidalo)[.!\s]*$/.test(m)){
      delete estado.cambio_multi;estado.esperando=null;
      return {mensaje:'De acuerdo, mantengo la cotización como estaba. ¿Qué deseas hacer?'};
    }
    if(esConsultaStock(texto))return null;
    if(Number(q.version)!==Number(previo.version)){
      delete estado.cambio_multi;estado.esperando=null;
      return {mensaje:'La cotización cambió desde tu solicitud. Dime nuevamente las cantidades para revisarlas con la versión actual.'};
    }
    const reemplazar=/\b(?:modificar|modifica|cambiar|cambia|reemplazar|reemplaza|ajustar|ajusta|dejar|dejemos|sustituir)\b/.test(m);
    const sumar=/\b(?:sumar|suma|agregar|agrega|anadir|anade|adicionales?|mas cajas)\b/.test(m);
    if(reemplazar!==sumar){
      return {operaciones:previo.items,modo:reemplazar?'FIJAR':'AGREGAR',version:previo.version};
    }
    return {mensaje:`Tengo pendiente ${describir(previo.items)}. ¿Quieres reemplazar las cantidades actuales o sumar esas cajas?`};
  }
  const items=extraerProductos(texto);
  const solicitud=/\b(?:quiero|necesito|pedir|pido|cotizar|cotiza|comprar|modificar|modifica|cambiar|cambia|ajustar|ajusta|sumar|suma|agregar|agrega|anadir|anade|dejar|dejemos)\b/.test(m);
  if(items.length>=2 && solicitud && items.every(x=>!x.correccion&&x.cantidad!==null) && !esConsultaStock(texto) && !/\b(?:precio|precios|comparar|sin|no quiero|quitar|retirar|eliminar)\b/.test(m)){
    if(!items.some(x=>q.items?.some(y=>y.id_producto===x.id)))return null;
    const reemplazar=/\b(?:modificar|modifica|cambiar|cambia|ajustar|ajusta|reemplazar|reemplaza|dejar|dejemos)\b/.test(m);
    const sumar=/\b(?:sumar|suma|agregar|agrega|anadir|anade)\b/.test(m);
    if(reemplazar!==sumar)return {operaciones:items,modo:reemplazar?'FIJAR':'AGREGAR',version:q.version};
    estado.cambio_multi={items,version:q.version};estado.esperando='ELEGIR_ACCION_MULTIPRODUCTO';
    return {mensaje:`Ya tienes esos productos en tu cotización. Para ${describir(items)}, ¿quieres reemplazar las cantidades actuales o sumar esas cajas?`};
  }
  // Una sugerencia de IA no modifica datos: se muestra completa y se pide elección.
  const sugeridas=interpretacion.lineas_sugeridas;
  if(interpretacion.motor==='groq' && interpretacion.quiere_cambiar_productos===true &&
     Array.isArray(sugeridas) && sugeridas.length>=2 && sugeridas.length<=3 &&
     new Set(sugeridas.map(x=>x.id)).size===sugeridas.length &&
     sugeridas.every(x=>nombres[x.id]&&Number.isInteger(x.cantidad)&&x.cantidad>=1&&x.cantidad<=10000) &&
     sugeridas.some(x=>q.items?.some(y=>y.id_producto===x.id)) &&
     (!/[¿?]/.test(texto)||/\b(?:quiero|necesito|deseo|quisiera)\s+(?:pedir|comprar|cotizar)\b/.test(m)) && !/\b(?:no|sin|quitar|eliminar|retirar|precio|precios|stock|disponibilidad)\b/.test(m)){
    estado.cambio_multi={items:sugeridas.map(x=>({id:x.id,cantidad:x.cantidad})),version:q.version};
    estado.esperando='ELEGIR_ACCION_MULTIPRODUCTO';
    return {mensaje:`Entendí ${describir(estado.cambio_multi.items)}. ¿Quieres reemplazar las cantidades actuales o sumar esas cajas? Si no entendí bien, puedes cancelar y corregirme.`};
  }
  if(items.length>=2 && solicitud && items.some(x=>x.correccion) && items.every(x=>x.cantidad!==null) &&
     !/\b(?:precio|precios|stock|sin|no quiero|quitar|eliminar)\b/.test(m) && items.some(x=>q.items?.some(y=>y.id_producto===x.id))){
    estado.cambio_multi={items,version:q.version};estado.esperando='ELEGIR_ACCION_MULTIPRODUCTO';
    return {mensaje:`Entendí ${describir(items)}. ¿Quieres reemplazar las cantidades actuales o sumar esas cajas? Si no entendí bien, puedes cancelar y corregirme.`};
  }
  if(/^(?:quiero |deseo |necesito )?(?:modificar|cambiar|ajustar)(?: mi| la)?(?: cotizacion| pedido)?[.!\s]*$/.test(m)){
    estado.esperando='MODIFICAR_LINEAS';
    return {mensaje:'Claro, ¿qué cantidades quieres cambiar? Puedes escribir, por ejemplo, «cambiar a 50 cajas de entera y 60 de fresca».'};
  }
  return null;
}
