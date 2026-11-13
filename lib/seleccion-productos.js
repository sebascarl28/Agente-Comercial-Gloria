// Selección conversacional: no convertir cantidad de productos en cajas ni
// repartir una cantidad entre varias líneas sin que el cliente lo indique.
import {normalizar,detectarProducto,esConsultaStock,pideQuitarProducto} from './dialogo.js';

const nombres={'PRD-001':'leche UHT entera','PRD-002':'leche evaporada','PRD-003':'leche fresca'};
export function extraerProductos(texto='') {
  const partes=normalizar(texto).split(/\s+(?:y|e|mas|ademas)\s+|[,;]+/);
  const encontrados=[];
  for(const parte of partes){
    const p=detectarProducto(parte);
    if(!p)continue;
    // Una fecha o capacidad de presentación (1 L, 400 g) no es una cantidad de cajas.
    const antes=parte.match(/\b(\d{1,5})\s*(?:cajas?\s*)?(?:de\s+)?(?:leche\s+)?(?:uht|uth|uthd|uhtd|uhtt|uhd|uhtl|entera|larga vida|evaporad\w*|evapord\w*|evapora|fresc\w*|freca|frsca|freska|fresqa)\b/);
    const cajas=parte.match(/\b(\d{1,5})\s*cajas?\b/);
    const despues=parte.match(/\b(?:uht|entera|evaporada|fresca|freca)\s+(\d{1,5})[.!\s]*$/);
    const de=parte.match(/\b(\d{1,5})\s+de\s+(?:leche\s+)?([a-z]+)/);
    const cantidadFuzzy=de&&detectarProducto(de[2])?.id===p.id?de:null;
    const num=antes||cajas||despues||cantidadFuzzy;
    const cantidad=num&&Number(num[1])>=1&&Number(num[1])<=10000?Number(num[1]):null;
    if(!encontrados.some(x=>x.id===p.id))encontrados.push({id:p.id,cantidad,correccion:p.correccion});
  }
  return encontrados;
}
export function cantidadDeProductos(texto='') {
  return /\b(?:\d+|dos|tres|varios|varias)\s+(?:productos?|tipos?|variedades|leches)\b/.test(normalizar(texto));
}
const listar=items=>items.map(x=>nombres[x.id]).join(' y ');

// Devuelve null cuando el turno pertenece a otra parte del flujo.
// Las operaciones solo se devuelven cuando cada producto tiene su cantidad.
export function avanzarSeleccion(texto,estado={},cotizacion=null) {
  const m=normalizar(texto);
  const previo=estado.seleccion_productos;
  if(previo && /^(?:cancelar|cancela|olvidalo|empezar de nuevo)[.!\s]*$/.test(m)){
    delete estado.seleccion_productos; estado.esperando=null;
    return {mensaje:'Listo, cancelé esta selección. ¿Qué leche necesitas?'};
  }
  if(esConsultaStock(texto)||pideQuitarProducto(texto))return null;
  const productos=extraerProductos(texto);
  const cuenta=cantidadDeProductos(texto);
  if(!previo && productos.length<2 && !cuenta)return null;
  if(!previo && /\b(?:precio|precios|cuesta|comparar|diferencia|informacion|catalogo)\b/.test(m))return null;
  const numeroTipos=m.match(/\b(\d+|dos|tres)\s+(?:productos?|tipos?|variedades|leches)\b/);
  const total=previo?.total||({dos:2,tres:3}[numeroTipos?.[1]]||Number(numeroTipos?.[1])||null);
  if(total && total>3){
    delete estado.seleccion_productos;estado.esperando=null;
    return {mensaje:'En este catálogo tenemos tres tipos: UHT entera, evaporada y fresca. ¿Cuáles te interesan?'};
  }
  let items=(previo?.items||[]).map(x=>({...x}));
  // «100 cajas de cada una» expresa una cantidad para cada variedad.
  const mismaCantidad=m.match(/\b(\d{1,5})\s*(?:cajas?\s*)?(?:(?:de|para|por|a)\s+)?cada\s+(?:una|uno|producto|tipo|variedad|leche)\b/);
  if(productos.length){
    for(const p of productos){
      const existente=items.find(x=>x.id===p.id);
      if(existente){if(p.cantidad!==null)existente.cantidad=p.cantidad;}
      else items.push(p);
    }
  } else if(items.length && !mismaCantidad){
    // Respuesta numérica al producto por el que acabamos de preguntar.
    const numero=m.match(/^(\d{1,5})(?:\s+cajas?)?[.!\s]*$/);
    const pendiente=items.find(x=>x.cantidad===null);
    if(numero&&pendiente){const n=Number(numero[1]);if(n>=1&&n<=10000)pendiente.cantidad=n;}
    else return {mensaje:`Para ${nombres[pendiente.id]}, ¿cuántas cajas necesitas? Puedes escribir, por ejemplo, 30 cajas.`};
  }
  if(mismaCantidad && items.length>=2 && (!total || items.length>=total) && !/\b(?:no|sin|evita)\b/.test(m)){
    const n=Number(mismaCantidad[1]);
    if(n>=1&&n<=10000)for(const item of items)item.cantidad=n;
  }
  if(productos.some(x=>x.correccion)){
    return {mensaje:'Quiero asegurarme de entender el tipo de leche. ¿Puedes escribir los nombres como UHT entera, evaporada o fresca?'};
  }
  if(!items.length){
    estado.seleccion_productos={items,total};estado.esperando='SELECCIONAR_LECHES';
    return {mensaje:'¿Cuáles leches deseas? Tenemos UHT entera, evaporada y fresca.'};
  }
  const duplicados=items.filter(x=>cotizacion?.estado!=='CONFIRMADA'&&cotizacion?.items?.some(y=>y.id_producto===x.id));
  if(duplicados.length){
    delete estado.seleccion_productos;estado.esperando=null;
    return {mensaje:`Ya tienes ${listar(duplicados)} en la cotización. Para no cambiar tus cajas por error, dime por separado si quieres sumar o modificar ese producto; después añadimos los demás.`};
  }
  estado.seleccion_productos={items,total};
  if(total && items.length<total){
    estado.esperando='SELECCIONAR_LECHES';
    return {mensaje:`Anoté ${listar(items)}. ¿Qué otra leche deseas añadir?`};
  }
  const pendiente=items.find(x=>x.cantidad===null);
  if(pendiente){
    estado.esperando='CANTIDAD_SELECCION';
    const intro=productos.length>1?`Entendí ${listar(items)}. `:productos.length===1&&items.length===1?`Anoté ${listar(items)}. `:'';
    const pendientes=items.filter(x=>x.cantidad===null);
    if(pendientes.length>1){
      return {mensaje:`${intro}¿Cuántas cajas necesitas de cada una? Puedes decir «100 de cada una» o indicar las cantidades y sus leches en un solo mensaje.`};
    }
    return {mensaje:`${intro}¿Cuántas cajas de ${nombres[pendiente.id]} necesitas?`};
  }
  return {operaciones:items};
}
