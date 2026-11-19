import {saludDb} from '../lib/db.js';
import {respuesta,errorJson,metodo} from '../lib/http.js';

// Usa /models: valida la clave y el modelo sin consumir cuota de generación.
export async function verificarGroq(timeoutMs=6000,fetchFn=globalThis.fetch){
  if(!process.env.GROQ_API_KEY)return {ok:false,estado:'sin_clave',detalle:'Falta configurar GROQ_API_KEY en Vercel.'};
  const abort=new AbortController();
  const timer=setTimeout(()=>abort.abort(),timeoutMs);
  try{
    const r=await fetchFn('https://api.groq.com/openai/v1/models',{
      headers:{Authorization:`Bearer ${process.env.GROQ_API_KEY}`},signal:abort.signal
    });
    if(!r.ok){
      let codigo='';
      try{const e=await r.json();codigo=String(e?.error?.code||e?.error?.type||'').slice(0,48);}catch{}
      return {ok:false,estado:`http_${r.status}`,detalle:codigo||'sin detalle'};
    }
    const modelo=process.env.GROQ_MODEL||'openai/gpt-oss-120b';
    let ids=[];
    try{const j=await r.json();ids=Array.isArray(j.data)?j.data.map(x=>String(x?.id||'')).filter(Boolean):[];}catch{}
    const out={ok:true,estado:'ok',modelo_configurado:modelo};
    if(ids.length){
      out.modelo_valido=ids.includes(modelo);
      if(!out.modelo_valido)out.modelos_sugeridos=ids.slice(0,8);
    }
    return out;
  }catch(err){
    const tipo=err?.name==='AbortError'?'tiempo de espera agotado':'error de red';
    return {ok:false,estado:'red',detalle:tipo};
  }finally{clearTimeout(timer);}
}

async function atender(req,res){
  metodo(req,['GET']);
  const [base,groq]=await Promise.all([saludDb(),verificarGroq()]);
  respuesta(res,200,{
    ok:base.ok&&groq.ok&&groq.modelo_valido!==false,
    fecha:new Date().toISOString(),
    base,
    groq
  });
}

export default async function handler(req,res){
  try{await atender(req,res);}catch(err){errorJson(res,err);}
}
