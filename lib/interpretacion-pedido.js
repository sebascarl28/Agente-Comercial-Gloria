import {normalizar,detectarProducto,esConfirmacionCorta,esConsultaStock} from './dialogo.js';
import {extraerProductos} from './seleccion-productos.js';

const nombres={'PRD-001':'leche UHT entera','PRD-002':'leche evaporada','PRD-003':'leche fresca'};
const esPedido=m=>/\b(?:quiero|quisiera|necesito|deseo|pedir|pido|cotizar|cotiza|comprar|agregar|anadir)\b/.test(m);
const describir=xs=>xs.map(x=>`${x.cantidad} cajas de ${nombres[x.id]}`).join(' y ');
const validas=xs=>Array.isArray(xs)&&xs.length>=2&&xs.length<=3&&new Set(xs.map(x=>x.id)).size===xs.length&&xs.every(x=>nombres[x.id]&&Number.isInteger(x.cantidad)&&x.cantidad>=1&&x.cantidad<=10000);

// No asignar la primera cantidad al único producto reconocido si otra línea
// contiene una variedad desconocida. Esto protege también el modo sin Groq.
export function hayLineaNoReconocida(texto=''){
 const partes=normalizar(texto).split(/\s+(?:y|e|mas|ademas)\s+|[,;]+/);
 if(partes.length<2)return false;
 return partes.some(p=>/\b\d{1,5}\s*(?:cajas?\b|de\s+(?:leche\s+)?[a-z]+)/.test(p)&&!detectarProducto(p));
}
export function interpretarPedidoNuevo(texto,estado,q,ia={}){
 const m=normalizar(texto),previo=estado.propuesta_productos;
 if(previo && q){
   delete estado.propuesta_productos;estado.esperando=null;
   return {mensaje:'La cotización cambió mientras revisábamos esos productos. Indícame nuevamente qué deseas hacer.'};
 }
 if(q)return null;
 if(previo){
   if(esConsultaStock(texto))return null;
   if(/^(?:no|cancelar|cancela|corregir|olvidalo)[.!\s]*$/.test(m)){
     delete estado.propuesta_productos;estado.esperando='PEDIR_PRODUCTO';
     return {mensaje:'De acuerdo, no crearé esa cotización. Indícame las leches y las cajas de cada una.'};
   }
   if(esConfirmacionCorta(texto)||/^(?:si[, ]+)?(?:es )?(?:correcto|asi es|ambas|ambos)[.!\s]*$/.test(m))return {operaciones:previo};
   return {mensaje:`Tengo pendiente confirmar ${describir(previo)}. ¿Es correcto? También puedes decir «corregir».`};
 }
 const lineasExplicitas=(m.match(/\b\d{1,5}\b/g)||[]).length>=2 && /\s(?:y|e|mas|ademas)\s|[,;]/.test(m);
 if((!esPedido(m)&&!lineasExplicitas)||/\b(?:precio|precios|cuesta|cuestan|stock|inventario|disponibilidad|no quiero|sin|quitar|retirar)\b/.test(m))return null;
 const detectadas=extraerProductos(texto);
 const propuestas=ia.motor==='groq'&&ia.quiere_cambiar_productos===true&&validas(ia.lineas_sugeridas)?ia.lineas_sugeridas:null;
 const dudosas=validas(detectadas)&&detectadas.some(x=>x.correccion)?detectadas:null;
 const candidatos=propuestas||dudosas;
 if(candidatos){
   estado.propuesta_productos=candidatos.map(x=>({id:x.id,cantidad:x.cantidad}));
   estado.esperando='CONFIRMAR_PRODUCTOS_INTERPRETADOS';
   return {mensaje:`Entendí ${describir(estado.propuesta_productos)}. ¿Es correcto? Si no, puedes corregirme antes de crear la cotización.`};
 }
 if(hayLineaNoReconocida(texto))return {mensaje:'No pude identificar todas las variedades con seguridad. ¿Puedes indicarme cada leche y su cantidad? Por ejemplo: 50 cajas de evaporada y 30 de fresca.'};
 return null;
}
