import {preguntaLimiteDescuento} from './ciclo-cotizacion.js';
// Groq interpreta lenguaje natural; únicamente el backend consulta datos y ejecuta reglas.
import {fechaLimaHoy,sumarDias,fechaSinAnio} from './rules.js';
import {pideOrientacion,quierePedirLeche} from './orientacion.js';
import {corregirEscritura} from './escritura.js';
const ACCIONES=['conversar','catalogo','precio','cotizar','cantidad','descuento','pago','entrega','confirmar','credito','aceptar','rechazar','consultar','direccion'];
export function temaConsulta(mensaje) {
  const m=String(mensaje||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  if(/\b(por que|porque|motivo|razon|observacion|justificacion|que decidio|que dijo)\b/.test(m)){
    if(/\b(descuento|jefatura|porcentaje|rebaja)\b/.test(m))return 'descuento';
    if(/\b(credito|finanzas|linea)\b/.test(m))return 'credito';
  }
  const estado=/\b(aprobaron|aprobo|aprobado|aprobada|autorizaron|autorizo|autorizado|autorizada|estado|seguimiento|pendiente|respondio|respondieron|resolvieron|que paso|como va|como fue|como salio|como quedo|que dijeron|ya esta|ya fue|ya me|dijeron|revisar mi|ver mi|donde va)\b/;
  if(/\b(resumen|que acordamos|que hemos acordado|mi cotizacion|nuestra cotizacion)\b/.test(m) && !/\b(quiero|necesito|haz|prepara|modifica|cambia|nueva)\b/.test(m))return 'general';
  if(estado.test(m)) {
    if(/\b(descuento|jefatura|porcentaje)\b/.test(m))return 'descuento';
    if(/\b(credito|finanzas|linea)\b/.test(m))return 'credito';
    if(/\b(entrega|despacho|fecha|produccion)\b/.test(m))return 'entrega';
    if(/\b(pedido)\b/.test(m))return 'pedido';
    return 'general';
  }
  if(/\b(?:se acepto|me aceptaron|aceptaron|ya aprobaron|me aprobaron|se aprobo|autorizaron|ya autorizaron|esta aprobado|esta aceptado)\b/.test(m) && /\b(?:descuento|jefatura|porcentaje)\b/.test(m))return 'descuento';
  if(/\b(cuanto descuento tengo|cual es mi descuento|cual fue el descuento)\b/.test(m))return 'descuento';
  return null;
}
export function fechaEscrita(mensaje,hoy=fechaLimaHoy()) {
  const m=corregirEscritura(String(mensaje||'').toLowerCase()).replace(/\bnovimebre\b/g,'noviembre');
  const iso=m.match(/\b(20\d\d)-(0[1-9]|1[0-2])-([0-2]\d|3[01])\b/);
  if(iso)return iso[0];
  const corta=m.match(/\b([0-3]?\d)[\/-]([01]?\d)[\/-](20\d{2})\b/);
  if(corta)return `${corta[3]}-${corta[2].padStart(2,'0')}-${corta[1].padStart(2,'0')}`;
  const numerica=m.match(/\b([0-3]?\d)\s+(?:de|del)\s+([01]?\d)\s+(?:de|del)\s+(20\d{2})\b/);
  if(numerica)return `${numerica[3]}-${numerica[2].padStart(2,'0')}-${numerica[1].padStart(2,'0')}`;
  const meses={enero:1,febrero:2,marzo:3,abril:4,mayo:5,junio:6,julio:7,agosto:8,septiembre:9,setiembre:9,octubre:10,noviembre:11,diciembre:12};
  const natural=m.match(/\b([0-3]?\d)\s+(?:de|del)\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)(?:\s+(?:de|del)\s+(20\d\d))?/);
  if(natural){const mm=String(meses[natural[2]]).padStart(2,'0');const dd=natural[1].padStart(2,'0');return natural[3]?`${natural[3]}-${mm}-${dd}`:fechaSinAnio(dd,mm,hoy);}
  if(/pasado ma[nñ]ana/.test(m))return sumarDias(hoy,2);
  if(/\bma[nñ]ana\b/.test(m))return sumarDias(hoy,1);
  // «el viernes», «para el lunes»: el próximo día con ese nombre (si hoy es viernes, el de la semana siguiente).
  const semana=m.match(/\b(lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)\b/);
  if(semana){
    const objetivo={lunes:1,martes:2,miercoles:3,'miércoles':3,jueves:4,viernes:5,sabado:6,'sábado':6,domingo:0}[semana[1]];
    const actual=new Date(`${hoy}T12:00:00Z`).getUTCDay();
    const proxima=/\b(?:pr[oó]xim[ao]|siguiente|otra)\.?\s+semana\b|\bsemana (?:que viene|entrante|siguiente|proxima)\b/.test(m);
    if(proxima){const lunes=(8-actual)%7||7;return sumarDias(hoy,lunes+(objetivo+6)%7);}
    return sumarDias(hoy,(objetivo-actual+7)%7||7);
  }
  // «para el 28», «recibirlo el 28»: día del mes dentro de una frase (si hay varios, vale el último: «no para el 21, sino para el 28»).
  const diasFrase=[...m.matchAll(/\b(?:para el(?: dia)?|el dia|recibir(?:lo|la|los|las)? el|entregar(?:lo|la|los|las)? el|que sea el)\s+([0-3]?\d)\b(?!\s*(?:de\b|[\/-]|%|cajas?|unidades|:|\d))/g)];
  if(diasFrase.length){
    const dia=Number(diasFrase.at(-1)[1]),base=new Date(`${hoy}T12:00:00Z`);
    const candidato=new Date(Date.UTC(base.getUTCFullYear(),base.getUTCMonth(),dia,12));
    if(dia>=1&&candidato.getUTCDate()===dia){
      const f=candidato.toISOString().slice(0,10);
      // Si ya pasó hace pocos días se deja pasada (el agente avisará); si fue hace mucho, se entiende el mes siguiente.
      if(f>=hoy||(new Date(`${hoy}T12:00:00Z`)-candidato)/86400000<=10)return f;
      candidato.setUTCMonth(candidato.getUTCMonth()+1);
      if(candidato.getUTCDate()===dia)return candidato.toISOString().slice(0,10);
    }
  }
  // «El 17 de este mes» corresponde al mes actual, aun si ya pasó.
  const esteMes=m.match(/\b(?:el\s+)?([0-3]?\d)\s+de\s+este\s+mes\b/);
  if(esteMes){
    const base=new Date(`${hoy}T12:00:00Z`),dia=Number(esteMes[1]);
    const d=new Date(Date.UTC(base.getUTCFullYear(),base.getUTCMonth(),dia,12));
    if(d.getUTCMonth()===base.getUTCMonth()&&d.getUTCDate()===dia)return d.toISOString().slice(0,10);
    return null;
  }
  // Día del mes escrito como «el 20» o «20» tras preguntar por la fecha.
  if(!/cajas?|unidades?|%/.test(m)){
    const d=m.trim().match(/^(?:(?:para )?el |d[ií]a )?([0-3]?\d)$/);
    if(d){const dia=Number(d[1]);const base=new Date(`${hoy}T12:00:00Z`);
      const candidato=new Date(Date.UTC(base.getUTCFullYear(),base.getUTCMonth(),dia,12));
      if(candidato.getUTCDate()===dia){if(candidato.toISOString().slice(0,10)<hoy)candidato.setUTCMonth(candidato.getUTCMonth()+1);
        return candidato.toISOString().slice(0,10);}
    }
  }
  return null;
}
const PRESENTACION=/^(?:hola[,!\s]+)?(?:soy|me llamo|mi nombre es)\s+(?!un\b|una\b|el\b|la\b)([a-záéíóúñ]{2,20})(?:\s+[a-záéíóúñ]{2,20})?[!.\s]*$/;
const ORIENTACION='Bienvenido a Gloria. ¿Qué te gustaría cotizar hoy: leche UHT, evaporada o fresca?';
// Las respuestas libres de la IA se pulen: sin emojis y sin la pregunta genérica «¿en qué puedo ayudarte con la leche?».
export function pulirRespuesta(texto=''){
  return String(texto)
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu,'')
    .replace(/¿?\s*en qué (?:te )?puedo ayudar(?:te)?(?: hoy)?(?: con (?:la |tu |las )?(?:leche|lácteos|compra|pedido))?(?: hoy)?\s*\?/gi,'¿Qué te gustaría cotizar hoy: leche UHT, evaporada o fresca?')
    .replace(/\s{2,}/g,' ').trim();
}
export function respuestaRespaldo(mensaje){
 const m=corregirEscritura(String(mensaje).toLowerCase());
 const presentacion=m.trim().match(PRESENTACION);
 if(presentacion)return `Mucho gusto, ${presentacion[1].charAt(0).toUpperCase()+presentacion[1].slice(1)}. ${ORIENTACION}`;
 if(/\b(triste|deprimid[oa]|desanimad[oa]|me siento mal|estresad[oa]|agotad[oa])\b/.test(m))return 'Lamento que estés pasando por un momento difícil. Si quieres contarme qué ocurre, te escucho con gusto. Cuando prefieras, retomamos tu consulta comercial.';
 if(/tanque volador|oso polar|soy un(a)?\s/.test(m))return '¡Qué presentación tan original! Encantado de atenderte. ¿Te muestro las leches disponibles o prefieres que preparemos una cotización?';
 if(/^(hola|holi|buenas|buenos días|buenas tardes|buenas noches|hey|qué tal|que tal)[!.,\s]*$/.test(m))return '¡Hola! Bienvenido a Gloria, soy tu asesor comercial. ¿Qué te gustaría cotizar hoy: leche UHT, evaporada o fresca?';
 if(/^(gracias|muchas gracias|genial|perfecto|ok|vale|listo)[!.,\s]*$/.test(m))return 'Con mucho gusto. Si necesitas algo más, aquí estoy para ayudarte.';
 return 'Con gusto te ayudo. ¿Podrías contarme un poco más sobre lo que necesitas?';
}
export function respaldo(mensaje,contexto={}){
 const m=corregirEscritura(String(mensaje).toLowerCase()).trim();
 let n=m.match(/(\d{1,5})\s*(?:cajas|caja|cj|unidades)\b/i);
 if(!n&&/\b(?:uht|entera|fresca|evaporada)\b/.test(m))n=m.match(/\b(?:necesito|quiero|quisiera|dame|manda|mandame|ponme|pedir|comprar|cotizar|llevar)\b[^\d%]{0,40}?\b(\d{1,5})\s*$/);
 const pct=m.match(/\b(\d{1,2}(?:[.,]\d+)?)\s*(?:%|por\s*ciento\b)/);
 const tema=temaConsulta(mensaje);
 const f=fechaEscrita(mensaje,contexto.fecha_hoy||fechaLimaHoy());
 const modo=/\b(dos (?:entregas|partes)|por partes|fraccionad[ao]|parcial)\b/.test(m)?'DOS_PARTES':/\b(todo junto|todas juntas|entrega completa|de una sola vez)\b/.test(m)?'TODO_DESPUES':null;
 const intencion=tema?'consultar':/\b(confirmar|registrar) (?:el |mi )?pedido\b/.test(m)?'confirmar'
   :/^(s[ií]|acepto|aceptamos|de acuerdo|confirmo la propuesta|me parece bien|confirmo (?:la )?direcci[oó]n)\b/.test(m)?'aceptar'
   :/^(no acepto|rechazo|no gracias|no me parece)\b/.test(m)?'rechazar'
   :/\b(descuento|\d+\s*%)\b/.test(m)||pct?'descuento'
   :/\b(c[oó]tiz|necesito|quiero|dame|comprar|pedido de)\b/.test(m)&&n?'cotizar'
   :/\b(pagar|forma de pago|pago|contado|anticipo)\b/.test(m)?'pago'
   :/\b(cr[eé]dito|l[ií]nea)\b/.test(m)?'credito'
   :/\b(entrega|fecha|despach|primero|despu[eé]s|parte|juntas|juntos|recibir)\b/.test(m)||f?'entrega'
   :/\b(productos?|cat[aá]logo|leches)\b/.test(m)?'catalogo':'conversar';
 return {accion:intencion,tema_consulta:tema,modo_entrega:modo,producto:/evaporad/.test(m)?'PRD-002':/fresca/.test(m)?'PRD-003':/uht|entera/.test(m)?'PRD-001':null,cantidad:n?Number(n[1]):null,descuento_pct:pct?Number(pct[1].replace(',','.')):null,modalidad:/cr[eé]dito/.test(m)?'CREDITO':/anticipo/.test(m)?'ANTICIPO':/contado/.test(m)?'CONTADO':null,fecha_deseada:f,primera_cantidad:null,primera_fecha:null,segunda_fecha:null,respuesta_libre:respuestaRespaldo(mensaje)};
}
// Las operaciones con intención inequívoca se resuelven con reglas de negocio.
// Groq queda disponible para expresiones ambiguas; esto ahorra cuota.
// Un enfriamiento local protege contra una ráfaga de HTTP 429 en la misma instancia.
// Pausas por proveedor y modelo: el límite de un modelo no bloquea a los demás.
const pausaIA={};
export function reiniciarPausasIA(){for(const k of Object.keys(pausaIA))delete pausaIA[k];}
export function intencionVerificableSinLLM(mensaje=''){
  const m=corregirEscritura(String(mensaje)).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  return /^(?:hola[,!\s]+)?(?:soy|me llamo|mi nombre es)\s+(?!un\b|una\b|el\b|la\b)[a-zñ]{2,20}(?:\s+[a-zñ]{2,20})?[!.\s]*$/.test(m) || preguntaLimiteDescuento(mensaje) || (/\b(?:\d+|dos|tres)\s+(?:leches|lecehes|productos?|tipos?|variedades)\b/.test(m) && !/\b\d+\s*cajas?\b/.test(m)) || pideOrientacion(m) || /^(?:quiero|quisiera|necesito|deseo|puedo)\s+(?:pedir|comprar|cotizar|ordenar)\s+(?:una\s+)?leche[?!.,\s]*$/.test(m)
    || /\b(?:caso\s+pc\s*3|escenario\s+pc\s*3|caso\s+del\s+informe)\b/.test(m)
    || /\b(?:stock|inventario|disponibilidad|disponibles?)\b/.test(m)
    || (/\b(?:recib\w*|entreg\w*|despach\w*)\b/.test(m) && /\b(?:\d{1,2}\s+de\s+(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)|\d{1,2}\/\d{1,2})\b/.test(m))
    || (/\b(?:por que|porque|a que se debe|cual es el motivo)\b/.test(m) && /\b(?:entreg\w*|recib\w*|cajas?|falt\w*|producc\w*)\b/.test(m));
}
// Los modelos GPT-OSS de Groq admiten decodificación con esquema estricto.
// Todos los campos opcionales son anulables y se siguen validando en el backend.
const propiedadesIA={
 accion:{type:'string',enum:ACCIONES},tema_consulta:{type:['string','null'],enum:['descuento','credito','entrega','pedido','general',null]},
 producto:{type:['string','null'],enum:['PRD-001','PRD-002','PRD-003',null]},cantidad:{type:['integer','null']},
 descuento_pct:{type:['number','null']},modalidad:{type:['string','null'],enum:['CONTADO','CREDITO','ANTICIPO',null]},
 modo_entrega:{type:['string','null'],enum:['DOS_PARTES','TODO_DESPUES','PERSONALIZADA',null]},
 fecha_deseada:{type:['string','null']},primera_cantidad:{type:['integer','null']},
 primera_fecha:{type:['string','null']},segunda_fecha:{type:['string','null']},respuesta_libre:{type:['string','null']},
 quiere_cambiar_productos:{type:'boolean'},lineas_sugeridas:{type:'array',items:{type:'object',properties:{id:{type:'string',enum:['PRD-001','PRD-002','PRD-003']},cantidad:{type:'integer'}},required:['id','cantidad'],additionalProperties:false}}
};
export function formatoGroq(modelo){
 if(['openai/gpt-oss-120b','openai/gpt-oss-20b'].includes(modelo))return {type:'json_schema',json_schema:{name:'turno_comercial',strict:true,schema:{type:'object',properties:propiedadesIA,required:Object.keys(propiedadesIA),additionalProperties:false}}};
 return {type:'json_object'};
}
// Acepta un objeto JSON envuelto en un bloque de código o texto breve, sin adivinar datos
// comerciales a partir de una respuesta incompleta.
function leerObjetoIA(contenido){
 if(typeof contenido!=='string'||!contenido.trim())throw new SyntaxError('respuesta vacía');
 const texto=contenido.trim();
 try{const objeto=JSON.parse(texto);if(objeto&&typeof objeto==='object'&&!Array.isArray(objeto))return objeto;}catch{}
 let inicio=texto.indexOf('{'),nivel=0,comillas=false,escape=false;
 for(let i=inicio;i>=0&&i<texto.length;i++){
  const c=texto[i];
  if(escape){escape=false;continue;}
  if(comillas&&c==='\\'){escape=true;continue;}
  if(c==='"'){comillas=!comillas;continue;}
  if(comillas)continue;
  if(c==='{')nivel++;
  if(c==='}'&&--nivel===0){
   try{const objeto=JSON.parse(texto.slice(inicio,i+1));if(objeto&&typeof objeto==='object'&&!Array.isArray(objeto))return objeto;}catch{}
   break;
  }
 }
 throw new SyntaxError('respuesta JSON inválida');
}
export async function interpretar(mensaje,contexto={}){
 const base=respaldo(mensaje,contexto);
 if(!process.env.GROQ_API_KEY&&!process.env.DEEPSEEK_API_KEY)return {...base,motor:'reglas_sin_groq'};
 if(intencionVerificableSinLLM(mensaje))return {...base,motor:'reglas_contextuales'};
 const historial=(Array.isArray(contexto.historial)?contexto.historial:[]).slice(-10).filter(x=>x&&['cliente','agente'].includes(x.rol)&&typeof x.texto==='string').map(x=>({role:x.rol==='cliente'?'user':'assistant',content:x.texto.slice(0,700)}));
 const datos={...contexto};delete datos.historial;
 const system=`Eres el Agente Comercial Gloria, asesor B2B de leche. No tienes herramientas ni acceso a buscadores: no invoques funciones ni herramientas; el backend hace las consultas. Devuelve solo el JSON solicitado. Responde en español natural y breve, mantén el contexto de los últimos turnos. Tu función principal es negociar conversando, NO responder como un formulario. Permite añadir varias leches a una cotización, sin sustituir las cantidades anteriores salvo petición explícita. Si se equivoca con un nombre como UTHD, considera que podría ser UHT y pide confirmación antes de modificar datos. Adapta cada respuesta a la última pregunta y no repitas una plantilla. Si pregunta «hasta cuándo tienen», aclara si se refiere a vencimiento o fecha de entrega. Si el cliente pregunta por stock, debe conocerlo aunque no haya dicho cuántas cajas quiere: el backend consultará el ERP. Recuerda el producto seleccionado, la cantidad y las preferencias guardadas en estado_negociacion; no repitas preguntas ya respondidas. Cuando exista faltante, propón alternativas respaldadas por lotes liberados y plan de producción. Nunca supongas que todo el pedido tiene cobertura ni interpretes cajas de una entrega parcial como una nueva cantidad total. Pregunta si desea entregas fraccionadas o juntas, luego pago, descuento opcional y dirección. Si pregunta el precio o cuánto cuesta usa accion=precio; jamás inventes precios o totales, los calcula el backend. Si pregunta si Jefatura o Finanzas aprobaron algo, usa accion=consultar; no inventes la respuesta. Si pide una fecha, usa accion=entrega y fecha_deseada. Si dice 'dos partes', usa modo_entrega=DOS_PARTES. Si dice 'todas juntas', usa TODO_DESPUES. Si dice 'sí' usa aceptar y el backend comprobará qué se está aceptando. Tu tono es profesional, cálido y claro: el cliente debe sentirse atendido y comprendido. Saluda con cortesía y orienta la conversación (por ejemplo: «¡Hola! Bienvenido a Gloria. ¿Qué te gustaría cotizar hoy: leche UHT, evaporada o fresca?»). Reconoce brevemente lo que el cliente dijo antes de preguntar. Evita frases vagas o poco profesionales como «¿en qué puedo ayudarte con la leche?», no uses emojis ni jerga, y no repitas la misma frase. Habla en frases cortas y naturales, nada de plantillas ni lenguaje de formulario. El cliente puede escribir con errores, sin tildes, con abreviaturas o jerga (por ejemplo «kiero lech fesca», «nesecito 20 cajs», «xfa»): entiéndelo sin corregirlo ni mencionar el error, y si algo es ambiguo pregunta de forma breve y amable. Habla como un asesor comercial con un cliente: NUNCA muestres códigos internos (PRD-001, PRD-002, PRD-003, lotes, órdenes) ni jerga como ERP o QM; nombra las leches como «leche UHT», «leche evaporada» y «leche fresca», y escribe las fechas como «17 de noviembre». No prometas liberación de Calidad, fecha logística, stock ni descuentos; esas validaciones las hace el backend. No confirmes pedidos automáticamente. Fecha local de referencia: ${contexto.fecha_hoy||fechaLimaHoy()}. Contexto comercial verificado: ${JSON.stringify(datos).slice(0,1600)}. DEVUELVE SOLO JSON con: accion (conversar|catalogo|precio|cotizar|cantidad|descuento|pago|entrega|confirmar|credito|aceptar|rechazar|consultar|direccion); tema_consulta (descuento|credito|entrega|pedido|general|null); producto (PRD-001 UHT|PRD-002 evaporada|PRD-003 fresca|null); cantidad (entero de cajas|null); descuento_pct (número|null); modalidad (CONTADO|CREDITO|ANTICIPO|null); modo_entrega (DOS_PARTES|TODO_DESPUES|PERSONALIZADA|null); fecha_deseada (YYYY-MM-DD|null); primera_cantidad (entero|null); primera_fecha (YYYY-MM-DD|null); segunda_fecha (YYYY-MM-DD|null); respuesta_libre (1-3 frases cordiales SOLO si accion=conversar, si no null); quiere_cambiar_productos (booleano: si solicita cotizar, pedir, añadir o cambiar productos; también si aún no tiene cotización); lineas_sugeridas (lista de objetos {id,cantidad} para cada leche mencionada con cajas explícitas o escritas en palabras; si hay dudas usa lista vacía; nunca interpretes fecha, número de productos ni unidades por envase como cajas). El sistema pedirá confirmación antes de aplicar las sugerencias.`;
 const ejemploDeepSeek=JSON.stringify({accion:'cotizar',tema_consulta:null,producto:'PRD-002',cantidad:20,descuento_pct:null,modalidad:null,modo_entrega:null,fecha_deseada:null,primera_cantidad:null,primera_fecha:null,segunda_fecha:null,respuesta_libre:null,quiere_cambiar_productos:true,lineas_sugeridas:[{id:'PRD-002',cantidad:20}]});
 const instruccionJSON=`Devuelve un único objeto JSON. Ejemplo de formato (no copies sus valores): ${ejemploDeepSeek}`;
 // Orden de los proveedores configurable (ver más abajo).
 // Cada proveedor se pausa por separado. Los errores 400/401/403 descartan al resto de ese proveedor
 // (otro modelo con la misma clave no ayuda), pero sí se prueba el siguiente proveedor.
 const deDeepseek=[],deGroq=[];
 if(process.env.DEEPSEEK_API_KEY)deDeepseek.push({proveedor:'deepseek',modelo:process.env.DEEPSEEK_MODEL||'deepseek-flash'});
 if(process.env.GROQ_API_KEY)for(const m of new Set([process.env.GROQ_MODEL||'openai/gpt-oss-120b',process.env.GROQ_MODEL_RESPALDO||'openai/gpt-oss-20b']))deGroq.push({proveedor:'groq',modelo:m});
 // DeepSeek responde primero y Groq queda de respaldo. Con IA_PROVEEDOR_PRIMERO=groq se invierte el orden, sin tocar código.
 const candidatos=/^groq$/i.test(process.env.IA_PROVEEDOR_PRIMERO||'')?[...deGroq,...deDeepseek]:[...deDeepseek,...deGroq];
 const limiteMs=Number(process.env.GROQ_TIMEOUT_MS)||7000;
 const descartados=new Set();let diagnostico='',p=null,proveedorUsado=null,intentos=0;
 for(const {proveedor,modelo} of candidatos){
  if(descartados.has(proveedor)||Date.now()<(pausaIA[proveedor+':'+modelo]||0))continue;
  intentos++;
  const abort=new AbortController();const timer=setTimeout(()=>abort.abort(),proveedor==='deepseek'?Math.max(limiteMs,12000):limiteMs);
  const mensajesIA=[{role:'system',content:system},...historial,{role:'user',content:mensaje}];
  try{
   let url,clave,cuerpo;
   if(proveedor==='groq'){
    url='https://api.groq.com/openai/v1/chat/completions';clave=process.env.GROQ_API_KEY;
    cuerpo={model:modelo,temperature:0.3,max_completion_tokens:2048,include_reasoning:false,response_format:formatoGroq(modelo),messages:mensajesIA};
    if(modelo.startsWith('openai/gpt-oss-'))cuerpo.reasoning_effort='low';
   }else{
    // DeepSeek: formato compatible con OpenAI, JSON con json_object (sin esquema estricto) y sin modo de razonamiento.
    url='https://api.deepseek.com/chat/completions';clave=process.env.DEEPSEEK_API_KEY;
    cuerpo={model:modelo,temperature:0.2,max_tokens:3072,response_format:{type:'json_object'},thinking:{type:'disabled'},messages:[{role:'system',content:system+' '+instruccionJSON},...historial,{role:'user',content:mensaje}]};
   }
   let r,codigo='';
   for(let intento=0;intento<(proveedor==='deepseek'?3:2);intento++){
    r=await fetch(url,{method:'POST',signal:abort.signal,headers:{Authorization:`Bearer ${clave}`,'Content-Type':'application/json'},body:JSON.stringify(cuerpo)});
    if(r.ok){
     const respuesta=await r.json();
     try{
      p=leerObjetoIA(respuesta.choices?.[0]?.message?.content);
      if(typeof p.accion!=='string'&&!Array.isArray(p.lineas_sugeridas))throw new SyntaxError('sin intención');
      proveedorUsado=proveedor;break;
     }catch(err){
      if(proveedor!=='deepseek'||intento===2)throw err;
      // DeepSeek puede devolver espacios en modo JSON: un intento con formato texto
      // y un contexto más corto permite recuperar un objeto sin aceptar texto libre.
      cuerpo.response_format={type:'text'};cuerpo.temperature=0.1;
      cuerpo.messages=[{role:'system',content:`Eres asesor comercial B2B de Gloria. Interpreta el mensaje y devuelve SOLO un objeto JSON, sin texto adicional. No inventes precios, stock, fechas ni aprobaciones. Las operaciones las valida el backend. ${instruccionJSON} Usa accion según la solicitud (conversar, catalogo, precio, cotizar, cantidad, descuento, pago, entrega, confirmar, credito, aceptar, rechazar, consultar o direccion); producto PRD-001 UHT, PRD-002 evaporada o PRD-003 fresca; conserva cantidades anteriores salvo cambio explícito. Fecha local ${contexto.fecha_hoy||fechaLimaHoy()}. Estado: ${JSON.stringify(datos).slice(0,1400)}.`},...historial.slice(-4),{role:'user',content:mensaje}];
      continue;
     }
    }
    try{const e=await r.json();codigo=String(e?.error?.code||e?.error?.type||'').slice(0,64);}catch{codigo='';}
    // Solo se reintenta una falla de formato, evitando repetir cobros por otros errores.
    if(intento===0 && r.status===400 && ['json_validate_failed','tool_use_failed'].includes(codigo)){
     // Sin ejecutar ni reutilizar ninguna herramienta o generación fallida.
     cuerpo.response_format={type:'json_object'};cuerpo.temperature=0.1;
     continue;
    }
    break;
   }
   if(!r.ok){
    console.error('IA status:',r.status,'code:',codigo,'proveedor:',proveedor,'modelo:',modelo);
    diagnostico=`${proveedor==='groq'?'':'DeepSeek · '}HTTP ${r.status}${codigo?' · '+codigo:''}`;
    if(r.status===429){
     const segundos=Number(r.headers.get('retry-after'));
     pausaIA[proveedor+':'+modelo]=Date.now()+1000*(Number.isFinite(segundos)&&segundos>0?Math.min(300,segundos):60);
    }else if(r.status>=500)pausaIA[proveedor+':'+modelo]=Date.now()+20000;
    else descartados.add(proveedor);
    continue;
   }
   if(!p)throw new SyntaxError('respuesta JSON inválida');
   break;
  }catch(err){
   const tipo=err?.name==='AbortError'?'tiempo de espera agotado':err instanceof SyntaxError?'respuesta JSON inválida':String(err?.name||'Error').slice(0,48);
   console.error('IA fallback:',tipo,'proveedor:',proveedor,'modelo:',modelo);
   diagnostico=tipo;p=null;
   if(!(err instanceof SyntaxError))pausaIA[proveedor+':'+modelo]=Date.now()+20000;
  }finally{clearTimeout(timer);}
 }
 if(!p)return {...base,motor:'respaldo_groq',diagnostico_groq:diagnostico||'IA en pausa temporal por límite o falla reciente (reglas activas)'};
 return {quiere_cambiar_productos:p.quiere_cambiar_productos===true,lineas_sugeridas:Array.isArray(p.lineas_sugeridas)?p.lineas_sugeridas.filter(x=>x&&['PRD-001','PRD-002','PRD-003'].includes(x.id)&&Number.isInteger(x.cantidad)&&x.cantidad>0&&x.cantidad<=10000).slice(0,3):[],accion:base.tema_consulta?'consultar':ACCIONES.includes(p.accion)?p.accion:base.accion,tema_consulta:base.tema_consulta||(['descuento','credito','entrega','pedido','general'].includes(p.tema_consulta)?p.tema_consulta:null),producto:['PRD-001','PRD-002','PRD-003'].includes(p.producto)?p.producto:base.producto,cantidad:Number.isInteger(p.cantidad)&&p.cantidad>0?p.cantidad:base.cantidad,descuento_pct:typeof p.descuento_pct==='number'?p.descuento_pct:base.descuento_pct,modalidad:['CONTADO','CREDITO','ANTICIPO'].includes(p.modalidad)?p.modalidad:base.modalidad,modo_entrega:['DOS_PARTES','TODO_DESPUES','PERSONALIZADA'].includes(p.modo_entrega)?p.modo_entrega:base.modo_entrega,fecha_deseada:typeof p.fecha_deseada==='string'&&/^20\d\d-\d\d-\d\d$/.test(p.fecha_deseada)?p.fecha_deseada:base.fecha_deseada,primera_cantidad:Number.isInteger(p.primera_cantidad)&&p.primera_cantidad>0?p.primera_cantidad:null,primera_fecha:typeof p.primera_fecha==='string'?p.primera_fecha:null,segunda_fecha:typeof p.segunda_fecha==='string'?p.segunda_fecha:null,respuesta_libre:typeof p.respuesta_libre==='string'&&p.respuesta_libre.trim()?pulirRespuesta(p.respuesta_libre.trim().slice(0,650)):base.respuesta_libre,motor:'groq',proveedor_ia:proveedorUsado};
}
