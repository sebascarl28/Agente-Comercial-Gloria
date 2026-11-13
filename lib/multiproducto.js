// Cálculos puros de cotizaciones con varias líneas. El backend valida cada línea.
const dinero=n=>Math.round((Number(n)+Number.EPSILON)*100)/100;
export function calcularLineas(lineas,descuentoPct=0){
  if(!Array.isArray(lineas)||!lineas.length)throw new Error('La cotización no tiene productos.');
  if(!Number.isFinite(Number(descuentoPct))||descuentoPct<0||descuentoPct>100)throw new Error('Descuento inválido.');
  const ids=new Set();
  const detalle=lineas.map(l=>{
    const cantidad=Number(l.cantidad),precio=Number(l.precio_unitario??l.precio),costo=Number(l.costo),minimo=Number(l.margen_minimo);
    if(ids.has(l.id_producto))throw new Error('Producto repetido en una cotización.');ids.add(l.id_producto);
    if(!Number.isInteger(cantidad)||cantidad<=0||cantidad>10000||!Number.isFinite(precio)||precio<=0||!Number.isFinite(costo)||costo<0)throw new Error('Línea de producto inválida.');
    const neto=precio*(1-Number(descuentoPct)/100);
    const margen=(neto-costo)/neto*100;
    if(margen+1e-7<minimo)throw new Error(`El descuento no cumple el margen mínimo de ${l.producto_nombre||l.nombre||l.id_producto}.`);
    return {...l,cantidad,precio_unitario:precio,descuento_pct:Number(descuentoPct),subtotal:dinero(cantidad*neto),margen_pct:dinero(margen)};
  });
  const subtotal=dinero(detalle.reduce((t,l)=>t+l.subtotal,0));
  const igv=dinero(subtotal*0.18),total=dinero(subtotal+igv);
  return {lineas:detalle,subtotal,igv,total,cantidad:detalle.reduce((t,l)=>t+l.cantidad,0)};
}
export function validarEntregasMulti(lineas,partes){
  if(!Array.isArray(partes)||!partes.length)throw new Error('Faltan las entregas.');
  const cantidades=new Map(lineas.map(l=>[l.id_producto,Number(l.cantidad)]));
  const suma=new Map(lineas.map(l=>[l.id_producto,0]));
  for(const p of partes){
    if(!cantidades.has(p.id_producto))throw new Error('La entrega incluye un producto no cotizado.');
    if(!Number.isInteger(Number(p.cajas))||Number(p.cajas)<=0)throw new Error('Cantidad de entrega inválida.');
    suma.set(p.id_producto,suma.get(p.id_producto)+Number(p.cajas));
  }
  for(const [id,cantidad] of cantidades){if(cantidad!==suma.get(id))throw new Error(`Las entregas no cubren las ${cantidad} cajas de ${id}.`);}
  return true;
}
