import {normalizar,detectarProducto,cantidadExplicita,esConfirmacionCorta,esConsultaStock} from './dialogo.js';
import {extraerProductos,cantidadDeProductos} from './seleccion-productos.js';

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
   const correccion=extraerProductos(texto);
   const sumar=/\b(?:aument(?:a|ar|ale|arle|ame|arme)|sub(?:e|ir|ele|irle)|agreg(?:a|ar|ale|arle)|anad(?:e|ir|ele|irle)|sum(?:a|ar|ale|arle)|adicionales?)\b/.test(m)
     || /\b\d{1,5}\s*cajas?\s+mas\b/.test(m);
   const fijar=/\b(?:cambiar|cambia|corrige|corregir|modifica|modificar|dejar|dejalo|reemplaza|reemplazar)\b/.test(m)
     || /\b(?:aumenta|aumentar|sube)\s+a\s+\d{1,5}\b/.test(m);
   const totalExplicito=/\b(?:aumenta|aumentar|sube)\s+a\s+\d{1,5}\b/.test(m);
   if(validas(correccion) && (!sumar||totalExplicito) && /\b(?:no|quiero|quisiera|necesito|mejor|corregir|cambia|cambiar|perdon)\b/.test(m)){
     estado.propuesta_productos=correccion.map(x=>({id:x.id,cantidad:x.cantidad}));
     estado.esperando='CONFIRMAR_PRODUCTOS_INTERPRETADOS';
     return {mensaje:`Entendí ${describir(estado.propuesta_productos)}. ¿Es correcto? Si no, puedes corregirme antes de crear la cotización.`};
   }
   // Todavía no existe una cotización: «correcto, pero súmale 5 cajas a evaporada»
   // modifica la propuesta pendiente, sin aprobar la versión anterior.
   if((sumar||fijar) && !/^(?:no|cancelar|cancela|corregir|olvidalo)[.!\s]*$/.test(m) &&
      !/\b(?:no|sin|cancelar|descuento|credito|fecha|entrega|precio|stock)\b|%/.test(m)){
     if(sumar && !totalExplicito && correccion.length>1){
       if(!validas(correccion))return {mensaje:`Conservamos ${describir(previo)}. Indícame cuántas cajas deseas sumar de cada leche.`};
       const cambios=new Map(correccion.map(x=>[x.id,x.cantidad]));
       if(previo.some(x=>cambios.has(x.id)&&x.cantidad+cambios.get(x.id)>10000) ||
          new Set([...previo.map(x=>x.id),...cambios.keys()]).size>3)
         return {mensaje:'No puedo añadir más cajas o variedades a esta propuesta. Indícame las cantidades que deseas ajustar.'};
       estado.propuesta_productos=previo.map(x=>({id:x.id,cantidad:x.cantidad+(cambios.get(x.id)||0)}));
       for(const [id,cantidad] of cambios)if(!previo.some(x=>x.id===id))estado.propuesta_productos.push({id,cantidad});
       estado.esperando='CONFIRMAR_PRODUCTOS_INTERPRETADOS';
       return {mensaje:`Ahora entendí ${describir(estado.propuesta_productos)}. ¿Es correcto? Si quieres, puedes seguir ajustando las cajas antes de confirmarlo.`};
     }
     const producto=detectarProducto(texto);
     const n=cantidadExplicita(texto)||Number(m.match(/\b(?:aument\w*|sub\w*|agreg\w*|anad\w*|sum\w*)\s+(\d{1,5})\b/)?.[1]);
     if(!producto)return {mensaje:`Conservamos ${describir(previo)}. ¿A cuál leche deseas ${sumar?'sumar':'ajustar'} las cajas?`};
     if(!Number.isInteger(n)||n<1||n>10000)return {mensaje:`¿Cuántas cajas de ${nombres[producto.id]} deseas ${sumar?'sumar':'dejar en total'}?`};
     const anterior=previo.find(x=>x.id===producto.id);
     const cantidad=totalExplicito?n:sumar?Number(anterior?.cantidad||0)+n:n;
     if(cantidad>10000||(!anterior&&previo.length>=3))return {mensaje:'No puedo añadir más cajas o variedades a esta propuesta. Indícame las cantidades que deseas ajustar.'};
     estado.propuesta_productos=anterior?previo.map(x=>x.id===producto.id?{...x,cantidad}:x):[...previo,{id:producto.id,cantidad}];
     estado.esperando='CONFIRMAR_PRODUCTOS_INTERPRETADOS';
     return {mensaje:`Ahora entendí ${describir(estado.propuesta_productos)}. ¿Es correcto? Si quieres, puedes seguir ajustando las cajas antes de confirmarlo.`};
   }
   if(/^no[,!\s]+/.test(m) && !/^(?:no)[.!\s]*$/.test(m)){
     delete estado.propuesta_productos;estado.esperando='PEDIR_PRODUCTO';
     return {mensaje:'De acuerdo, no usaré esas cantidades. Dime qué leches y cuántas cajas de cada una necesitas.'};
   }
   if(/^(?:no|cancelar|cancela|corregir|olvidalo)[.!\s]*$/.test(m)){
     delete estado.propuesta_productos;estado.esperando='PEDIR_PRODUCTO';
     return {mensaje:'De acuerdo, no crearé esa cotización. Indícame las leches y las cajas de cada una.'};
   }
   if(esConfirmacionCorta(texto)||/^(?:si[, ]+)?(?:es )?(?:correcto|asi es|ambas|ambos)[.!\s]*$/.test(m))return {operaciones:previo};
   return {mensaje:`Tengo pendiente confirmar ${describir(previo)}. ¿Es correcto? También puedes decir «corregir».`};
 }
 // Mientras haya una selección activa, el intérprete debe respetar esa lista y su orden.
 if(estado.seleccion_productos?.items?.length || (cantidadDeProductos(texto) && !/\b\d+\s*cajas?\b/.test(m)))return null;
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
