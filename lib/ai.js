// Interpretación conversacional con Groq. Los montos, aprobaciones y cambios de BD
// se resuelven exclusivamente en los servicios del backend, nunca por texto generado.
const ACCIONES = ['conversar','catalogo','cotizar','cantidad','descuento','pago','entrega','confirmar','credito','aceptar','rechazar','consultar'];

export function respuestaRespaldo(mensaje) {
  const m=mensaje.toLowerCase().trim();
  if (/\b(triste|deprimid[oa]|desanimad[oa]|me siento mal|estresad[oa]|agotad[oa])\b/i.test(m))
    return 'Lamento que estés pasando por un momento difícil. Si quieres contarme qué ocurre, te escucho; y cuando prefieras, podemos continuar con tu consulta comercial.';
  if (/tanque volador|oso polar|soy un(a)?\s/i.test(m))
    return '¡Vaya presentación! 😄 Encantado de conocerte. Soy el Agente Comercial Gloria. ¿Te ayudo a explorar nuestras leches o tienes alguna consulta?';
  if (/^(hola|holi|buenas|buenos días|buenas tardes|buenas noches|hey|qué tal|que tal)[!.,\s]*$/i.test(m))
    return '¡Hola! 😊 ¿Cómo estás? Soy el Agente Comercial Gloria. Podemos conversar o revisar productos y cotizaciones cuando quieras.';
  if (/^(gracias|muchas gracias|genial|perfecto|ok|vale|listo)[!.,\s]*$/i.test(m))
    return '¡Con gusto! ¿Quieres que sigamos con tu consulta o hay algo más que necesites?';
  if (/\b(qué puedes hacer|que puedes hacer|ayuda|qué haces|como funciona)\b/i.test(m))
    return 'Te puedo ayudar a consultar leches Gloria, cotizar cajas, negociar descuentos, revisar formas de pago y proponer fechas de entrega. ¿Por dónde comenzamos?';
  return 'Te escucho. Cuéntame un poco más y te ayudo; si se trata de una compra, dime qué leche y cuántas cajas necesitas.';
}

export function respaldo(mensaje) {
  const m = mensaje.toLowerCase().trim();
  const n = m.match(/(\d{1,5})\s*(?:cajas|caja|cj|unidades)/i);
  const pct = m.match(/(\d{1,2}(?:[.,]\d+)?)\s*%/);
  const intent = /^(s[ií]|acepto|aceptamos|de acuerdo|confirmo la propuesta|me parece bien)\b/.test(m) ? 'aceptar'
    : /^(no acepto|rechazo|no gracias|no me parece)\b/.test(m) ? 'rechazar'
    : /descuento|\d+\s*%/.test(m) ? 'descuento'
    : /c[oó]tiz|necesito|quiero comprar|pedido de/.test(m) && n ? 'cotizar'
    : /pagar|forma de pago|pago|contado|anticipo/.test(m) ? 'pago'
    : /cr[eé]dito|l[ií]nea/.test(m) ? 'credito'
    : /entrega|fecha|despach/.test(m) ? 'entrega'
    : /confirmar (el |mi )?pedido/.test(m) ? 'confirmar'
    : /producto|cat[aá]logo|leches/.test(m) ? 'catalogo' : 'conversar';
  return {accion:intent,
    producto:/evaporad/i.test(m)?'PRD-002':/fresca/i.test(m)?'PRD-003':/uht|entera/i.test(m)?'PRD-001':null,
    cantidad:n?Number(n[1]):null,
    descuento_pct:pct?Number(pct[1].replace(',','.')):null,
    modalidad:/cr[eé]dito/i.test(m)?'CREDITO':/anticipo/i.test(m)?'ANTICIPO':/contado/i.test(m)?'CONTADO':null,
    respuesta_libre:respuestaRespaldo(m),
    fecha_deseada:null,primera_cantidad:null,primera_fecha:null,segunda_fecha:null};
}

export async function interpretar(mensaje, contexto={}) {
  const base=respaldo(mensaje);
  if (!process.env.GROQ_API_KEY) return {...base,motor:'reglas_sin_groq'};

  // Últimos turnos de este cliente (máx. ocho); el backend limita el contexto comercial.
  const historial=(Array.isArray(contexto.historial)?contexto.historial:[]).slice(-8)
    .filter(x=>x&&['cliente','agente'].includes(x.rol)&&typeof x.texto==='string')
    .map(x=>({role:x.rol==='cliente'?'user':'assistant',content:x.texto.slice(0,650)}));
  const datos={...contexto};delete datos.historial;
  const sistema=`Eres el Agente Comercial Gloria, un asesor B2B de leche para mayoristas y distribuidores (demostración académica). Hablas en español natural, breve y amable, sin sonar como un menú. Recuerda el contexto de los mensajes anteriores. Si alguien saluda, bromea o expresa una emoción, responde humanamente y de forma adecuada, no repitas la presentación institucional. Si pregunta por productos, usa la acción catalogo. Si pide cajas, cotización, descuento, crédito, pago o fecha de entrega, elige la acción correspondiente y NO inventes precios, inventario, fechas de despacho ni autorizaciones: los obtiene y valida el backend.
Devuelve SOLO un objeto JSON válido con estas claves: accion (conversar|catalogo|cotizar|cantidad|descuento|pago|entrega|confirmar|credito|aceptar|rechazar|consultar), producto (PRD-001=UHT, PRD-002=evaporada, PRD-003=fresca o null), cantidad (número entero de cajas o null), descuento_pct (número o null), modalidad (CONTADO|CREDITO|ANTICIPO|null), fecha_deseada (YYYY-MM-DD o null), primera_cantidad (entero o null), primera_fecha (YYYY-MM-DD o null), segunda_fecha (YYYY-MM-DD o null), respuesta_libre (respuesta natural de 1 a 3 frases solo para accion=conversar; null para acciones comerciales). No asumas cantidades, fechas ni aprobaciones. Si el cliente pide otro porcentaje, acción descuento; si acepta una propuesta, acción aceptar; si pide alternativas de entrega, acción entrega. Si una frase es ambigua, pide aclaración en respuesta_libre en vez de ejecutar una acción riesgosa. Contexto comercial verificado: ${JSON.stringify(datos).slice(0,1600)}.`;
  const c=new AbortController();const t=setTimeout(()=>c.abort(),18000);
  try {
    const r=await fetch('https://api.groq.com/openai/v1/chat/completions',{
      method:'POST',signal:c.signal,
      headers:{Authorization:`Bearer ${process.env.GROQ_API_KEY}`,'Content-Type':'application/json'},
      body:JSON.stringify({model:process.env.GROQ_MODEL||'openai/gpt-oss-120b',
        temperature:0.45,max_completion_tokens:1200,include_reasoning:false,
        response_format:{type:'json_object'},messages:[{role:'system',content:sistema},...historial,{role:'user',content:mensaje}]})
    });
    if (!r.ok) {
      console.error('Groq status:',r.status); // Nunca registrar la clave secreta ni el cuerpo del request.
      return {...base,motor:'respaldo_groq'};
    }
    const obj=await r.json();const raw=obj.choices?.[0]?.message?.content||'{}';const p=JSON.parse(raw);
    const accion=ACCIONES.includes(p.accion)?p.accion:base.accion;
    const respuestaLibre=typeof p.respuesta_libre==='string'&&p.respuesta_libre.trim()?p.respuesta_libre.trim().slice(0,650):base.respuesta_libre;
    return {accion,producto:['PRD-001','PRD-002','PRD-003'].includes(p.producto)?p.producto:base.producto,
      cantidad:Number.isInteger(p.cantidad)&&p.cantidad>0?p.cantidad:base.cantidad,
      descuento_pct:typeof p.descuento_pct==='number'?p.descuento_pct:base.descuento_pct,
      modalidad:['CONTADO','CREDITO','ANTICIPO'].includes(p.modalidad)?p.modalidad:base.modalidad,
      fecha_deseada:typeof p.fecha_deseada==='string'?p.fecha_deseada:null,
      primera_cantidad:Number.isInteger(p.primera_cantidad)?p.primera_cantidad:null,
      primera_fecha:typeof p.primera_fecha==='string'?p.primera_fecha:null,
      segunda_fecha:typeof p.segunda_fecha==='string'?p.segunda_fecha:null,
      respuesta_libre:respuestaLibre,motor:'groq'};
  } catch(err) {
    console.error('Groq fallback:',err?.name||'Error');
    return {...base,motor:'respaldo_groq'};
  } finally {clearTimeout(t);}
}
