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
    const para=parte.match(/\b(\d{1,5})\s*(?:cajas?\s*)?(?:para|de)\s+(?:(?:la|las|el|los)\s+)?(?:leche\s+)?([a-z]+)/);
    const cantidadPara=para&&detectarProducto(para[2])?.id===p.id?para:null;
    const posterior=parte.match(/\b(?:evaporad[ao]s?|fresc[ao]s?|entera|uht)\s+(?:quiero|necesito|dame)\s+(\d{1,5})\b/);
    const num=antes||cajas||despues||cantidadFuzzy||cantidadPara||posterior;
    const cantidad=num&&Number(num[1])>=1&&Number(num[1])<=10000?Number(num[1]):null;
    if(!encontrados.some(x=>x.id===p.id))encontrados.push({id:p.id,cantidad,correccion:p.correccion});
  }
  return encontrados;
}
export function cantidadDeProductos(texto='') {
  return /\b(?:\d+|dos|tres|varios|varias)\s+(?:productos?|tipos?|variedades|leches|lecehes)\b/.test(normalizar(texto));
}
const listar=items=>items.map(x=>nombres[x.id]).join(' y ');

// Devuelve null cuando el turno pertenece a otra parte del flujo.
// Las operaciones solo se devuelven cuando cada producto tiene su cantidad.
export function avanzarSeleccion(texto,estado={},cotizacion=null,ia={}) {
  const m=normalizar(texto);
  const previo=estado.seleccion_productos;
  if(estado.seleccion_reemplazo){
    const propuesta=estado.seleccion_reemplazo;
    if(/^(?:reemplazar|cambiar|reemplazar seleccion|cambiar seleccion)[.!\s]*$/.test(m)){
      estado.seleccion_productos={items:propuesta,total:null};delete estado.seleccion_reemplazo;
      estado.esperando='CANTIDAD_SELECCION';
      return {mensaje:`De acuerdo, seleccionamos ${listar(propuesta)}. ¿Cuántas cajas necesitas de cada una?`};
    }
    if(/^(?:anadir|agregar|sumar)(?: (?:la |el )?(?:otra |otro )?(?:leche|producto))?[.!\s]*$/.test(m)){
      const combinadas=[...(previo?.items||[]).map(x=>({...x}))];
      for(const p of propuesta)if(!combinadas.some(x=>x.id===p.id))combinadas.push(p);
      estado.seleccion_productos={items:combinadas,total:null};delete estado.seleccion_reemplazo;
      estado.esperando='CANTIDAD_SELECCION';
      return {mensaje:`De acuerdo, seleccionamos ${listar(combinadas)}. ¿Cuántas cajas necesitas de cada una?`};
    }
    if(/^(?:cancelar|no)[.!\s]*$/.test(m)){delete estado.seleccion_reemplazo;estado.esperando='CANTIDAD_SELECCION';return {mensaje:`Mantengo ${listar(previo.items)}. ¿Cuántas cajas necesitas de cada una?`};}
    return {mensaje:`Para entenderte bien, ¿quieres reemplazar la selección por ${listar(propuesta)} o añadir la leche nueva?`};
  }
  if(previo && /^(?:cancelar|cancela|olvidalo|empezar de nuevo)[.!\s]*$/.test(m)){
    delete estado.seleccion_productos; estado.esperando=null;
    return {mensaje:'Listo, cancelé esta selección. ¿Qué leche necesitas?'};
  }
  if(esConsultaStock(texto)||pideQuitarProducto(texto))return null;
  // «20 y 50 respectivamente» solo se aplica si coincide con toda la selección.
  if(previo?.items?.length && /\brespectivamente\b/.test(m)){
    const numeros=[...m.matchAll(/\b(\d{1,5})\b/g)].map(x=>Number(x[1]));
    if(numeros.length!==previo.items.length || numeros.some(n=>n<1||n>10000))
      return {mensaje:`Seleccionaste ${listar(previo.items)}. Necesito una cantidad para cada una; dime cuáles deseas y sus cajas.`};
    const items=previo.items.map((x,i)=>({...x,cantidad:numeros[i]}));
    estado.seleccion_productos={...previo,items};
    return {operaciones:items};
  }
  const productos=extraerProductos(texto);
  const cuenta=cantidadDeProductos(texto);
  // «3 leches» puede referirse a variedades o unidades, nunca repartirlo como cajas.
  const lechesAmbiguas=/\b(?:\d+|dos|tres)\s+(?:leches|lecehes)\b/.test(m) && !/\b\d+\s*cajas?\b/.test(m);
  if(lechesAmbiguas && productos.length){
    if(!previo?.items?.length)estado.seleccion_productos={items:productos.map(x=>({id:x.id,cantidad:null})),total:null};
    estado.esperando='CANTIDAD_SELECCION';
    return {mensaje:`Mencionaste ${listar(productos)}. ¿El número indica tipos de leche o cajas? Dime cuántas cajas necesitas de cada una.`};
  }
  if(!previo && productos.length<2 && !cuenta)return null;
  if(!previo && /\b(?:precio|precios|cuesta|comparar|diferencia|informacion|catalogo)\b/.test(m))return null;
  const numeroTipos=m.match(/\b(\d+|dos|tres)\s+(?:productos?|tipos?|variedades|leches|lecehes)\b/);
  const total=previo?.total||({dos:2,tres:3}[numeroTipos?.[1]]||Number(numeroTipos?.[1])||null);
  if(total && total>3){
    delete estado.seleccion_productos;estado.esperando=null;
    return {mensaje:'En este catálogo tenemos tres tipos: UHT entera, evaporada y fresca. ¿Cuáles te interesan?'};
  }
  // Una lista nueva que cambia algunas variedades puede significar sustituir o añadir.
  if(previo?.items?.length && productos.length>=2 && productos.every(x=>x.cantidad===null) &&
     productos.some(x=>!previo.items.some(y=>y.id===x.id)) && productos.some(x=>previo.items.some(y=>y.id===x.id))){
    estado.seleccion_reemplazo=productos.map(x=>({...x,cantidad:null}));
    estado.esperando='ACLARAR_SELECCION_PRODUCTOS';
    return {mensaje:`Antes teníamos ${listar(previo.items)}. ¿Quieres reemplazar esa selección por ${listar(productos)} o añadir la leche nueva?`};
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
    else {
      const propuesta=ia.motor==='groq'&&ia.quiere_cambiar_productos===true?ia.lineas_sugeridas:null;
      const hayNumeros=/\b(?:\d+|uno|dos|tres|cuatro|cinco|diez|veinte|treinta|cuarenta|cincuenta|cien|ciento)\b/.test(m);
      const compatible=hayNumeros&&Array.isArray(propuesta)&&propuesta.length===items.length&&
        new Set(propuesta.map(x=>x.id)).size===items.length&&
        propuesta.every(x=>items.some(y=>y.id===x.id)&&Number.isInteger(x.cantidad)&&x.cantidad>0&&x.cantidad<=10000);
      if(!compatible)return {mensaje:pendiente?`Para ${nombres[pendiente.id]}, ¿cuántas cajas necesitas? Puedes escribir, por ejemplo, 30 cajas.`:'¿Qué cantidades quieres modificar?'};
    }
  }
  if(mismaCantidad && items.length>=2 && (!total || items.length>=total) && !/\b(?:no|sin|evita)\b/.test(m)){
    const n=Number(mismaCantidad[1]);
    if(n>=1&&n<=10000)for(const item of items)item.cantidad=n;
  }
  if(productos.some(x=>x.correccion) && !cotizacion && productos.length>=2 && items.length===productos.length && productos.every(x=>Number.isInteger(x.cantidad)&&x.cantidad>0)){
    estado.propuesta_productos=productos.map(x=>({id:x.id,cantidad:x.cantidad}));
    estado.esperando='CONFIRMAR_PRODUCTOS_INTERPRETADOS';
    return {mensaje:`Entendí ${estado.propuesta_productos.map(x=>`${x.cantidad} cajas de ${nombres[x.id]}`).join(' y ')}. ¿Es correcto? Si no, puedes corregirme.`};
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
  // Si Groq aporta cantidades no reconocidas, solo propone líneas que coincidan
  // exactamente con la selección vigente; el cliente debe confirmarlas.
  const sugeridas=ia.motor==='groq'&&ia.quiere_cambiar_productos===true?ia.lineas_sugeridas:null;
  const mencionaCantidad=/\b(?:\d+|uno|dos|tres|cuatro|cinco|diez|veinte|treinta|cuarenta|cincuenta|cien|ciento)\b/.test(m);
  if(items.some(x=>x.cantidad===null) && mencionaCantidad && Array.isArray(sugeridas) && sugeridas.length===items.length &&
     new Set(sugeridas.map(x=>x.id)).size===items.length &&
     sugeridas.every(x=>items.some(y=>x.id===y.id)&&Number.isInteger(x.cantidad)&&x.cantidad>0&&x.cantidad<=10000)){
    const nombresPorId=new Map(sugeridas.map(x=>[x.id,x]));
    estado.propuesta_productos=items.map(x=>({id:x.id,cantidad:nombresPorId.get(x.id).cantidad}));
    estado.esperando='CONFIRMAR_PRODUCTOS_INTERPRETADOS';
    return {mensaje:`Entendí ${estado.propuesta_productos.map(x=>`${x.cantidad} cajas de ${nombres[x.id]}`).join(' y ')}. ¿Es correcto? Si no, puedes corregirme.`};
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
