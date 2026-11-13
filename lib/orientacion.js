// Recomendaciones comerciales prudentes: se basan en datos del backend,
// no en cantidades inventadas por el modelo ni en una promesa de entrega.
const nombre={'PRD-001':'leche UHT entera','PRD-002':'leche evaporada','PRD-003':'leche fresca'};
const normalizar=t=>String(t||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
export function pideOrientacion(texto=''){
 const m=normalizar(texto);
 return /\b(?:recomiendas|recomienda|recomiendan|recomendarias|recomendacion|aconsejas|aconseja|sugieres|sugiere)\b/.test(m)
   && !/\b(?:descuento|credito|finanzas|direccion|vencimiento)\b/.test(m);
}
export function recomendacionProducto(id,stock){
 if(!nombre[id])return 'Con gusto te ayudo a elegir. ¿Buscas UHT entera, evaporada o fresca? También cuéntame cuánto sueles vender.';
 const disponible=stock?.disponibles==null?NaN:Number(stock.disponibles);
 const cantidad=Number.isFinite(disponible)&&disponible>=0?`${disponible} cajas liberadas por Calidad`:'stock por verificar';
 return `Para ${nombre[id]}, consulté ${cantidad}. Para recomendarte una cantidad, ¿cuántas cajas sueles vender y para cuándo las necesitas? La entrega depende de la validación logística.`;
}
export function quierePedirLeche(texto=''){
 const m=normalizar(texto);
 return /\b(?:quiero|quisiera|necesito|deseo|puedo)\b.*\b(?:pedir|comprar|cotizar|ordenar)\b.*\bleche\b/.test(m);
}
