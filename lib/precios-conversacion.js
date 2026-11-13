import {normalizar,esConsultaStock} from './dialogo.js';
import {extraerProductos} from './seleccion-productos.js';
import {dinero} from './rules.js';
import {hayLineaNoReconocida} from './interpretacion-pedido.js';

export function pidePrecio(texto=''){
 const m=normalizar(texto);
 const explicito=/\b(?:precio|precios|cuesta|cuestan|costaria|costarian|cuanto cuestan?|cuanto vale|a como)\b/.test(m);
 const importe=/\b(?:cuanto es|cuanto sale|cuanto seria|cuanto pago)\b/.test(m) && !esConsultaStock(texto) && !/\b(?:descuento|credito|deuda|saldo)\b/.test(m);
 const valor=/\bvalor\b/.test(m) && !/\b(?:descuento|credito|deuda|saldo)\b/.test(m);
 return explicito||importe||valor;
}
export function preferenciasPrecio(texto,estado={},q=null,ia={}){
 const productos=extraerProductos(texto);
 const incierto=productos.some(x=>x.correccion);
 const idIA=ia.motor==='groq'&&['PRD-001','PRD-002','PRD-003'].includes(ia.producto)?ia.producto:null;
 const ids=productos.length?productos.map(x=>x.id):q?.items?.length?q.items.map(x=>x.id_producto):estado.producto?[estado.producto]:idIA?[idIA]:[];
 return {ids,incierto:incierto||hayLineaNoReconocida(texto),cantidad:productos.length===1?productos[0].cantidad:null,lineas:productos};
}
export function respuestaPrecios(catalogo,preferencias){
 if(preferencias.incierto)return 'Para darte el precio correcto, ¿de qué leche se trata: UHT entera, evaporada o fresca?';
 const productos=preferencias.ids.length?catalogo.filter(p=>preferencias.ids.includes(p.id_producto)):catalogo;
 if(!productos.length)return 'No encuentro ese producto activo en el catálogo. ¿Quieres consultar UHT, evaporada o fresca?';
 const fmt=n=>new Intl.NumberFormat('es-PE',{style:'currency',currency:'PEN'}).format(Number(n));
 const lista=productos.map(p=>`${p.nombre}: ${fmt(p.precio)} por caja`).join('; ');
 let respuesta=`Precios de lista sin IGV: ${lista}.`;
 if(productos.length===1 && Number.isInteger(preferencias.cantidad) && preferencias.cantidad>0){
   const subtotal=dinero(Number(productos[0].precio)*preferencias.cantidad),igv=dinero(subtotal*0.18);
   respuesta+=` Para ${preferencias.cantidad} cajas: subtotal ${fmt(subtotal)}, IGV ${fmt(igv)} y total estimado ${fmt(dinero(subtotal+igv))}, sin descuentos ni cargos adicionales.`;
 }
 if(productos.length>1 && preferencias.lineas?.length===productos.length && preferencias.lineas.every(x=>Number.isInteger(x.cantidad)&&x.cantidad>0)){
   const subtotal=dinero(preferencias.lineas.reduce((sum,x)=>sum+Number(productos.find(p=>p.id_producto===x.id).precio)*x.cantidad,0));
   const igv=dinero(subtotal*0.18);
   respuesta+=` Para las cantidades indicadas: subtotal ${fmt(subtotal)}, IGV ${fmt(igv)} y total estimado ${fmt(dinero(subtotal+igv))}, sin descuentos ni cargos adicionales.`;
 }
 return `${respuesta} Estos precios no reservan stock ni confirman una entrega.`;
}

export function respuestaTotalCotizacion(texto,q){
 if(!q || !/\b(?:total|mi cotizacion|mi pedido|esta cotizacion|este pedido)\b/.test(normalizar(texto)))return null;
 const total=Number(q.calculo?.total??q.total),subtotal=Number(q.calculo?.subtotal??q.subtotal),igv=Number(q.calculo?.igv??q.igv);
 if(![total,subtotal,igv].every(Number.isFinite))return null;
 const fmt=n=>new Intl.NumberFormat('es-PE',{style:'currency',currency:'PEN'}).format(n);
 return `En tu cotización actual: subtotal ${fmt(subtotal)}, IGV ${fmt(igv)} y total ${fmt(total)}. Incluye el descuento que figura en esa versión. Consultar el total no modifica tus reservas ni la entrega.`;
}
