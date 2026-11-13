// Groq interpreta lenguaje natural; únicamente el backend consulta datos y ejecuta reglas.
import {fechaLimaHoy,sumarDias} from './rules.js';
const ACCIONES=['conversar','catalogo','cotizar','cantidad','descuento','pago','entrega','confirmar','credito','aceptar','rechazar','consultar','direccion'];
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
export async function interpretar(mensaje,contexto={}){
 const base=respaldo(mensaje,contexto);
 if(!process.env.GROQ_API_KEY)return {...base,motor:'reglas_sin_groq'};
 const historial=(Array.isArray(contexto.historial)?contexto.historial:[]).slice(-10).filter(x=>x&&['cliente','agente'].includes(x.rol)&&typeof x.texto==='string').map(x=>({role:x.rol==='cliente'?'user':'assistant',content:x.texto.slice(0,700)}));
 const datos={...contexto};delete datos.historial;
 const system=`Eres el Agente Comercial Gloria, asesor B2B de leche. Responde en español natural y breve, mantén el contexto de los últimos turnos. Tu función principal es negociar conversando, NO es responder como un formulario. PRIMERO identifica producto y cajas, DESPUÉS pregunta fecha deseada; consulta stock y producción solo cuando necesites negociar disponibilidad. Pregunta si desea entregas fraccionadas o juntas, luego pago, descuento opcional y dirección. Si pregunta si Jefatura o Finanzas aprobaron algo, usa accion=consultar; no inventes la respuesta. Si pide una fecha, usa accion=entrega y fecha_deseada. Si dice 'dos partes', usa modo_entrega=DOS_PARTES. Si dice 'todas juntas', usa TODO_DESPUES. Si dice 'sí' usa aceptar y el backend comprobará qué se está aceptando. No prometas liberación de Calidad, fecha logística, stock ni descuentos; esas validaciones las hace el backend. No confirmes pedidos automáticamente. Fecha local de referencia: ${contexto.fecha_hoy||fechaLimaHoy()}. Contexto comercial verificado: ${JSON.stringify(datos).slice(0,1600)}. DEVUELVE SOLO JSON con: accion (conversar|catalogo|cotizar|cantidad|descuento|pago|entrega|confirmar|credito|aceptar|rechazar|consultar|direccion); tema_consulta (descuento|credito|entrega|pedido|general|null); producto (PRD-001 UHT|PRD-002 evaporada|PRD-003 fresca|null); cantidad (entero de cajas|null); descuento_pct (número|null); modalidad (CONTADO|CREDITO|ANTICIPO|null); modo_entrega (DOS_PARTES|TODO_DESPUES|PERSONALIZADA|null); fecha_deseada (YYYY-MM-DD|null); primera_cantidad (entero|null); primera_fecha (YYYY-MM-DD|null); segunda_fecha (YYYY-MM-DD|null); respuesta_libre (1-3 frases cordiales SOLO si accion=conversar, si no null).`;
 const abort=new AbortController();const timer=setTimeout(()=>abort.abort(),18000);
 try{
  const r=await fetch('https://api.groq.com/openai/v1/chat/completions',{method:'POST',signal:abort.signal,headers:{Authorization:`Bearer ${process.env.GROQ_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({model:process.env.GROQ_MODEL||'openai/gpt-oss-120b',temperature:0.3,max_completion_tokens:1100,include_reasoning:false,response_format:{type:'json_object'},messages:[{role:'system',content:system},...historial,{role:'user',content:mensaje}]})});
  if(!r.ok){console.error('Groq status:',r.status);return {...base,motor:'respaldo_groq'};}
  const obj=await r.json();const p=JSON.parse(obj.choices?.[0]?.message?.content||'{}');
  return {accion:base.tema_consulta?'consultar':ACCIONES.includes(p.accion)?p.accion:base.accion,tema_consulta:base.tema_consulta||(['descuento','credito','entrega','pedido','general'].includes(p.tema_consulta)?p.tema_consulta:null),producto:['PRD-001','PRD-002','PRD-003'].includes(p.producto)?p.producto:base.producto,cantidad:Number.isInteger(p.cantidad)&&p.cantidad>0?p.cantidad:base.cantidad,descuento_pct:typeof p.descuento_pct==='number'?p.descuento_pct:base.descuento_pct,modalidad:['CONTADO','CREDITO','ANTICIPO'].includes(p.modalidad)?p.modalidad:base.modalidad,modo_entrega:['DOS_PARTES','TODO_DESPUES','PERSONALIZADA'].includes(p.modo_entrega)?p.modo_entrega:base.modo_entrega,fecha_deseada:typeof p.fecha_deseada==='string'&&/^20\d\d-\d\d-\d\d$/.test(p.fecha_deseada)?p.fecha_deseada:base.fecha_deseada,primera_cantidad:Number.isInteger(p.primera_cantidad)&&p.primera_cantidad>0?p.primera_cantidad:null,primera_fecha:typeof p.primera_fecha==='string'?p.primera_fecha:null,segunda_fecha:typeof p.segunda_fecha==='string'?p.segunda_fecha:null,respuesta_libre:typeof p.respuesta_libre==='string'&&p.respuesta_libre.trim()?p.respuesta_libre.trim().slice(0,650):base.respuesta_libre,motor:'groq'};
 }catch(err){console.error('Groq fallback:',err?.name||'Error');return {...base,motor:'respaldo_groq'};}finally{clearTimeout(timer);}
}
