import { falla } from './http.js';
// La IA interpreta lenguaje natural; las reglas comerciales y los INSERT se ejecutan en el backend.
const ACCIONES = ['conversar','catalogo','cotizar','cantidad','descuento','pago','entrega','confirmar','credito','aceptar','rechazar','consultar'];
function respaldo(mensaje) {
  const m = mensaje.toLowerCase();
  const n = m.match(/(\d{1,5})\s*(?:cajas|caja|cj|unidades)/i);
  const pct = m.match(/(\d{1,2}(?:[.,]\d+)?)\s*%/);
  const intent = /^(s[ií]|acepto|aceptamos|de acuerdo|confirmo la propuesta|me parece bien)/.test(m) ? 'aceptar' : /^(no acepto|rechazo|no gracias|no me parece)/.test(m) ? 'rechazar' : /descuento|\d+\s*%/.test(m) ? 'descuento' : /c[oó]tiz|necesito|quiero comprar|pedido de/.test(m) && n ? 'cotizar' : /pagar|forma de pago|pago|contado|anticipo/.test(m) ? 'pago' : /cr[eé]dito|l[ií]nea/.test(m) ? 'credito' : /entrega|fecha|despach/.test(m) ? 'entrega' : /confirmar (el |mi )?pedido/.test(m) ? 'confirmar' : /producto|cat[aá]logo|leches/.test(m) ? 'catalogo' : 'conversar';
  return { accion:intent, producto:/evaporad/i.test(m) ? 'PRD-002' : /fresca/i.test(m) ? 'PRD-003' : /uht|entera/i.test(m) ? 'PRD-001' : null, cantidad:n?Number(n[1]):null, descuento_pct:pct?Number(pct[1].replace(',','.')):null, modalidad:/cr[eé]dito/i.test(m)?'CREDITO':/anticipo/i.test(m)?'ANTICIPO':/contado/i.test(m)?'CONTADO':null, respuesta_libre:null };
}
export async function interpretar(mensaje, contexto) {
  if (!process.env.GROQ_API_KEY) return {...respaldo(mensaje), motor:'reglas_sin_groq'};
  const sistema = `Eres el analizador de intención de un asistente comercial B2B de Gloria (prototipo académico). La empresa vende SOLO leche a mayoristas y distribuidores. Interpreta el último mensaje y devuelve SOLAMENTE objeto JSON con estos campos: accion (conversar|catalogo|cotizar|cantidad|descuento|pago|entrega|confirmar|credito|aceptar|rechazar|consultar), producto (PRD-001 UHT, PRD-002 evaporada, PRD-003 fresca, o null), cantidad (entero de cajas o null), descuento_pct (número o null), modalidad (CONTADO|CREDITO|ANTICIPO|null), fecha_deseada (YYYY-MM-DD|null), primera_cantidad (entero|null), primera_fecha (YYYY-MM-DD|null), segunda_fecha (YYYY-MM-DD|null), respuesta_libre (respuesta natural CORTA y cordial si accion=conversar, sin inventar precios, stock, decisiones ni fechas). Si el cliente pide cambiar cantidad usa cantidad. Si pide más descuento usa descuento. Si acepta una propuesta usa aceptar. Si solicita opciones de entrega usa entrega. No asumas una cantidad ni fecha que el cliente no mencionó. Contexto: ${JSON.stringify(contexto).slice(0,2000)}.`;
  const c = new AbortController(); const t = setTimeout(()=>c.abort(),14000);
  try {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions',{
      method:'POST',signal:c.signal,headers:{'Authorization':`Bearer ${process.env.GROQ_API_KEY}`,'Content-Type':'application/json'},
      body:JSON.stringify({model:process.env.GROQ_MODEL||'openai/gpt-oss-120b',temperature:0.1,max_completion_tokens:480,response_format:{type:'json_object'},messages:[{role:'system',content:sistema},{role:'user',content:mensaje}]})
    });
    if (!r.ok) {console.error('Groq status:',r.status);return {...respaldo(mensaje), motor:'respaldo_groq'};}
    const obj=await r.json(); const raw=obj.choices?.[0]?.message?.content || '{}'; const p=JSON.parse(raw);
    const base=respaldo(mensaje);
    return {accion:ACCIONES.includes(p.accion)?p.accion:base.accion, producto:typeof p.producto==='string'?p.producto:base.producto,cantidad:Number.isInteger(p.cantidad)?p.cantidad:base.cantidad,descuento_pct:typeof p.descuento_pct==='number'?p.descuento_pct:base.descuento_pct,modalidad:['CONTADO','CREDITO','ANTICIPO'].includes(p.modalidad)?p.modalidad:base.modalidad,fecha_deseada:p.fecha_deseada||null,primera_cantidad:p.primera_cantidad||null,primera_fecha:p.primera_fecha||null,segunda_fecha:p.segunda_fecha||null,respuesta_libre:typeof p.respuesta_libre==='string'?p.respuesta_libre.slice(0,600):null,motor:'groq'};
  } catch(err) {console.error('Groq fallback:',err.message); return {...respaldo(mensaje),motor:'respaldo_groq'};} finally {clearTimeout(t);}
}
