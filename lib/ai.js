import {preguntaLimiteDescuento} from './ciclo-cotizacion.js';
// Groq interpreta lenguaje natural; únicamente el backend consulta datos y ejecuta reglas.
import {fechaLimaHoy,sumarDias} from './rules.js';
import {pideOrientacion,quierePedirLeche} from './orientacion.js';
const ACCIONES=['conversar','catalogo','precio','cotizar','cantidad','descuento','pago','entrega','confirmar','credito','aceptar','rechazar','consultar','direccion'];
export function temaConsulta(mensaje) {
  const m=String(mensaje||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  const estado=/\b(aprobaron|aprobo|aprobado|aprobada|autorizaron|autorizo|autorizado|autorizada|estado|seguimiento|pendiente|respondio|respondieron|resolvieron|que paso|como va|como quedo|ya esta|ya fue|ya me|dijeron|revisar mi|ver mi|donde va)\b/;
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
  const m=String(mensaje||'').toLowerCase();
  const iso=m.match(/\b(20\d\d)-(0[1-9]|1[0-2])-([0-2]\d|3[01])\b/);
  if(iso)return iso[0];
  const corta=m.match(/\b([0-3]?\d)[\/-]([01]?\d)[\/-](20\d{2})\b/);
  if(corta)return `${corta[3]}-${corta[2].padStart(2,'0')}-${corta[1].padStart(2,'0')}`;
  if(/pasado ma[nñ]ana/.test(m))return sumarDias(hoy,2);
  if(/\bma[nñ]ana\b/.test(m))return sumarDias(hoy,1);
  const meses={enero:1,febrero:2,marzo:3,abril:4,mayo:5,junio:6,julio:7,agosto:8,septiembre:9,setiembre:9,octubre:10,noviembre:11,diciembre:12};
  const natural=m.match(/\b([0-3]?\d)\s+de\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)(?:\s+(?:de|del)\s+(20\d\d))?/);
  if(natural){let y=Number(natural[3]||hoy.slice(0,4));const mm=String(meses[natural[2]]).padStart(2,'0');const dd=natural[1].padStart(2,'0');let f=`${y}-${mm}-${dd}`;if(!natural[3]&&f<hoy)f=`${y+1}-${mm}-${dd}`;return f;}
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
export function respuestaRespaldo(mensaje){
 const m=String(mensaje).toLowerCase();
 if(/\b(triste|deprimid[oa]|desanimad[oa]|me siento mal|estresad[oa]|agotad[oa])\b/.test(m))return 'Lamento que te sientas así. Si quieres contarme qué ocurre, te escucho. Cuando prefieras, seguimos con tu consulta comercial.';
 if(/tanque volador|oso polar|soy un(a)?\s/.test(m))return '¡Qué presentación! 😄 Encantado. ¿Te ayudo a revisar las leches disponibles o buscas alguna cotización?';
 if(/^(hola|holi|buenas|buenos días|buenas tardes|buenas noches|hey|qué tal|que tal)[!.,\s]*$/.test(m))return '¡Hola! 😊 Soy el Agente Comercial Gloria. ¿Cómo puedo ayudarte?';
 if(/^(gracias|muchas gracias|genial|perfecto|ok|vale|listo)[!.,\s]*$/.test(m))return '¡Con gusto! ¿En qué más puedo ayudarte?';
 return 'Te escucho. ¿Me puedes contar un poco más para ayudarte con tu consulta?';
}
export function respaldo(mensaje,contexto={}){
 const m=String(mensaje).toLowerCase().trim();
 const n=m.match(/(\d{1,5})\s*(?:cajas|caja|cj|unidades)\b/i);
 const pct=m.match(/(\d{1,2}(?:[.,]\d+)?)\s*%/);
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
let groqPausaHasta=0;
export function intencionVerificableSinLLM(mensaje=''){
  const m=String(mensaje).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  return preguntaLimiteDescuento(mensaje) || (/\b(?:\d+|dos|tres)\s+(?:leches|lecehes|productos?|tipos?|variedades)\b/.test(m) && !/\b\d+\s*cajas?\b/.test(m)) || pideOrientacion(m) || /^(?:quiero|quisiera|necesito|deseo|puedo)\s+(?:pedir|comprar|cotizar|ordenar)\s+(?:una\s+)?leche[?!.,\s]*$/.test(m)
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
export async function interpretar(mensaje,contexto={}){
 const base=respaldo(mensaje,contexto);
 if(!process.env.GROQ_API_KEY)return {...base,motor:'reglas_sin_groq'};
 if(intencionVerificableSinLLM(mensaje))return {...base,motor:'reglas_contextuales'};
 if(Date.now()<groqPausaHasta)return {...base,motor:'respaldo_groq',diagnostico_groq:'HTTP 429 · límite temporal de Groq (reglas activas)'};
 const historial=(Array.isArray(contexto.historial)?contexto.historial:[]).slice(-10).filter(x=>x&&['cliente','agente'].includes(x.rol)&&typeof x.texto==='string').map(x=>({role:x.rol==='cliente'?'user':'assistant',content:x.texto.slice(0,700)}));
 const datos={...contexto};delete datos.historial;
 const system=`Eres el Agente Comercial Gloria, asesor B2B de leche. No tienes herramientas ni acceso a buscadores: no invoques funciones ni herramientas; el backend hace las consultas. Devuelve solo el JSON solicitado. Responde en español natural y breve, mantén el contexto de los últimos turnos. Tu función principal es negociar conversando, NO responder como un formulario. Permite añadir varias leches a una cotización, sin sustituir las cantidades anteriores salvo petición explícita. Si se equivoca con un nombre como UTHD, considera que podría ser UHT y pide confirmación antes de modificar datos. Adapta cada respuesta a la última pregunta y no repitas una plantilla. Si pregunta «hasta cuándo tienen», aclara si se refiere a vencimiento o fecha de entrega. Si el cliente pregunta por stock, debe conocerlo aunque no haya dicho cuántas cajas quiere: el backend consultará el ERP. Recuerda el producto seleccionado, la cantidad y las preferencias guardadas en estado_negociacion; no repitas preguntas ya respondidas. Cuando exista faltante, propón alternativas respaldadas por lotes liberados y plan de producción. Nunca supongas que todo el pedido tiene cobertura ni interpretes cajas de una entrega parcial como una nueva cantidad total. Pregunta si desea entregas fraccionadas o juntas, luego pago, descuento opcional y dirección. Si pregunta el precio o cuánto cuesta usa accion=precio; jamás inventes precios o totales, los calcula el backend. Si pregunta si Jefatura o Finanzas aprobaron algo, usa accion=consultar; no inventes la respuesta. Si pide una fecha, usa accion=entrega y fecha_deseada. Si dice 'dos partes', usa modo_entrega=DOS_PARTES. Si dice 'todas juntas', usa TODO_DESPUES. Si dice 'sí' usa aceptar y el backend comprobará qué se está aceptando. No prometas liberación de Calidad, fecha logística, stock ni descuentos; esas validaciones las hace el backend. No confirmes pedidos automáticamente. Fecha local de referencia: ${contexto.fecha_hoy||fechaLimaHoy()}. Contexto comercial verificado: ${JSON.stringify(datos).slice(0,1600)}. DEVUELVE SOLO JSON con: accion (conversar|catalogo|precio|cotizar|cantidad|descuento|pago|entrega|confirmar|credito|aceptar|rechazar|consultar|direccion); tema_consulta (descuento|credito|entrega|pedido|general|null); producto (PRD-001 UHT|PRD-002 evaporada|PRD-003 fresca|null); cantidad (entero de cajas|null); descuento_pct (número|null); modalidad (CONTADO|CREDITO|ANTICIPO|null); modo_entrega (DOS_PARTES|TODO_DESPUES|PERSONALIZADA|null); fecha_deseada (YYYY-MM-DD|null); primera_cantidad (entero|null); primera_fecha (YYYY-MM-DD|null); segunda_fecha (YYYY-MM-DD|null); respuesta_libre (1-3 frases cordiales SOLO si accion=conversar, si no null); quiere_cambiar_productos (booleano: si solicita cotizar, pedir, añadir o cambiar productos; también si aún no tiene cotización); lineas_sugeridas (lista de objetos {id,cantidad} para cada leche mencionada con cajas explícitas o escritas en palabras; si hay dudas usa lista vacía; nunca interpretes fecha, número de productos ni unidades por envase como cajas). El sistema pedirá confirmación antes de aplicar las sugerencias.`;
 const abort=new AbortController();const timer=setTimeout(()=>abort.abort(),18000);
 try{
  const modelo=process.env.GROQ_MODEL||'openai/gpt-oss-120b';
  const cuerpo={model:modelo,temperature:0.3,max_completion_tokens:2048,include_reasoning:false,response_format:formatoGroq(modelo),messages:[{role:'system',content:system},...historial,{role:'user',content:mensaje}]};
  if(modelo.startsWith('openai/gpt-oss-'))cuerpo.reasoning_effort='low';
  let r,codigo='';
  for(let intento=0;intento<2;intento++){
    r=await fetch('https://api.groq.com/openai/v1/chat/completions',{method:'POST',signal:abort.signal,headers:{Authorization:`Bearer ${process.env.GROQ_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify(cuerpo)});
    if(r.ok)break;
    try{const e=await r.json();codigo=String(e?.error?.code||e?.error?.type||'').slice(0,64);}catch{codigo='';}
    // Solo se reintenta una falla de formato, evitando repetir cobros por otros errores.
    if(intento===0 && r.status===400 && ['json_validate_failed','tool_use_failed'].includes(codigo)){
      // Sin ejecutar ni reutilizar ninguna herramienta o generación fallida.
      cuerpo.response_format={type:'json_object'};cuerpo.temperature=0.1;
      continue;
    }
    if(r.status===429){
      const segundos=Number(r.headers.get('retry-after'));
      groqPausaHasta=Date.now()+1000*(Number.isFinite(segundos)&&segundos>0?Math.min(300,segundos):60);
    }
    console.error('Groq status:',r.status,'code:',codigo);
    return {...base,motor:'respaldo_groq',diagnostico_groq:`HTTP ${r.status}${codigo?' · '+codigo:''}`};
  }
  const obj=await r.json();const p=JSON.parse(obj.choices?.[0]?.message?.content||'{}');
  return {quiere_cambiar_productos:p.quiere_cambiar_productos===true,lineas_sugeridas:Array.isArray(p.lineas_sugeridas)?p.lineas_sugeridas.filter(x=>x&&['PRD-001','PRD-002','PRD-003'].includes(x.id)&&Number.isInteger(x.cantidad)&&x.cantidad>0&&x.cantidad<=10000).slice(0,3):[],accion:base.tema_consulta?'consultar':ACCIONES.includes(p.accion)?p.accion:base.accion,tema_consulta:base.tema_consulta||(['descuento','credito','entrega','pedido','general'].includes(p.tema_consulta)?p.tema_consulta:null),producto:['PRD-001','PRD-002','PRD-003'].includes(p.producto)?p.producto:base.producto,cantidad:Number.isInteger(p.cantidad)&&p.cantidad>0?p.cantidad:base.cantidad,descuento_pct:typeof p.descuento_pct==='number'?p.descuento_pct:base.descuento_pct,modalidad:['CONTADO','CREDITO','ANTICIPO'].includes(p.modalidad)?p.modalidad:base.modalidad,modo_entrega:['DOS_PARTES','TODO_DESPUES','PERSONALIZADA'].includes(p.modo_entrega)?p.modo_entrega:base.modo_entrega,fecha_deseada:typeof p.fecha_deseada==='string'&&/^20\d\d-\d\d-\d\d$/.test(p.fecha_deseada)?p.fecha_deseada:base.fecha_deseada,primera_cantidad:Number.isInteger(p.primera_cantidad)&&p.primera_cantidad>0?p.primera_cantidad:null,primera_fecha:typeof p.primera_fecha==='string'?p.primera_fecha:null,segunda_fecha:typeof p.segunda_fecha==='string'?p.segunda_fecha:null,respuesta_libre:typeof p.respuesta_libre==='string'&&p.respuesta_libre.trim()?p.respuesta_libre.trim().slice(0,650):base.respuesta_libre,motor:'groq'};
 }catch(err){
    const tipo=err?.name==='AbortError'?'tiempo de espera agotado':err instanceof SyntaxError?'respuesta JSON inválida':String(err?.name||'Error').slice(0,48);
    console.error('Groq fallback:',tipo);
    return {...base,motor:'respaldo_groq',diagnostico_groq:tipo};
  }finally{clearTimeout(timer);}
}
