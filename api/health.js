import {respuesta,errorJson,metodo} from '../lib/http.js';
import {pingBaseDatos} from '../lib/db.js';

// Diagnóstico para el docente y para el equipo: GET /api/health  (y /api/health?groq=1 para probar Groq).
// No expone claves ni la URI de la base de datos; solo indica si están configuradas.
export default async function handler(req,res){
  try{
    metodo(req,['GET']);
    const informe={
      ok:true,hora:new Date().toISOString(),
      variables:{DATABASE_URL:!!process.env.DATABASE_URL,GROQ_API_KEY:!!process.env.GROQ_API_KEY,DEEPSEEK_API_KEY:!!process.env.DEEPSEEK_API_KEY},
      modelos:{principal:process.env.GROQ_MODEL||'openai/gpt-oss-120b',respaldo:process.env.GROQ_MODEL_RESPALDO||'openai/gpt-oss-20b'},
      base_datos:{ok:false},groq:{probado:false}
    };
    try{informe.base_datos={ok:true,ms:await pingBaseDatos()};}
    catch(e){informe.ok=false;informe.base_datos={ok:false,error:informe.variables.DATABASE_URL?'No respondió (revisa Supabase / el pooler en el puerto 6543).':'Falta DATABASE_URL en Vercel.'};}
    // La lista de modelos no consume tokens; solo comprueba que la clave y el servicio respondan.
    if(req.query?.groq==='1'){
      informe.groq={probado:true,ok:false};
      if(!informe.variables.GROQ_API_KEY)informe.groq.error='Falta GROQ_API_KEY en Vercel.';
      else{
        const ctl=new AbortController();const t=setTimeout(()=>ctl.abort(),5000);
        try{
          const r=await fetch('https://api.groq.com/openai/v1/models',{headers:{Authorization:`Bearer ${process.env.GROQ_API_KEY}`},signal:ctl.signal});
          informe.groq={probado:true,ok:r.ok,estado_http:r.status};
        }catch(e){informe.groq={probado:true,ok:false,error:e?.name==='AbortError'?'tiempo de espera agotado':'sin conexión'};}
        finally{clearTimeout(t);}
      }
    }
    respuesta(res,informe.base_datos.ok?200:503,informe);
  }catch(err){errorJson(res,err);}
}
