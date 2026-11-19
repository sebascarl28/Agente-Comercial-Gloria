// Servidor local sin Vercel: expone public/ y los handlers de api/.
// Las credenciales se leen de .env.local (ignorado por git).
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const RAIZ=path.dirname(fileURLToPath(import.meta.url));
const RUTAS={
  '/api/health':'./api/health.js',
  '/api/chat':'./api/chat.js',
  '/api/action':'./api/action.js',
  '/api/gestion':'./api/gestion.js',
  '/api/bootstrap':'./api/bootstrap.js'
};
const TIPOS={
  '.html':'text/html; charset=utf-8',
  '.js':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8',
  '.svg':'image/svg+xml',
  '.json':'application/json; charset=utf-8'
};

export async function cargarEnv(archivo='.env.local'){
  try{
    const texto=await readFile(path.join(RAIZ,archivo),'utf8');
    let cargadas=0;
    for(const linea of texto.split(/\r?\n/)){
      const m=linea.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
      if(!m||m[2].startsWith('#'))continue;
      let valor=m[2];
      if((valor.startsWith('"')&&valor.endsWith('"'))||(valor.startsWith("'")&&valor.endsWith("'")))valor=valor.slice(1,-1);
      if(process.env[m[1]]===undefined){process.env[m[1]]=valor;cargadas++;}
    }
    return cargadas;
  }catch(err){
    if(err?.code==='ENOENT')return 0;
    throw err;
  }
}

function respuestaCompatible(res){
  const cabeceras={};
  return {
    statusCode:200,
    setHeader(clave,valor){cabeceras[clave.toLowerCase()]=valor;},
    getHeader(clave){return cabeceras[clave.toLowerCase()];},
    end(cuerpo){
      if(res.writableEnded)return;
      res.writeHead(this.statusCode,{
        'Content-Type':cabeceras['content-type']||'application/json; charset=utf-8',
        'Cache-Control':'no-store'
      });
      res.end(cuerpo);
    }
  };
}

export function crearServidor(){
  return http.createServer(async(req,res)=>{
    try{
      const url=new URL(req.url,'http://localhost');
      const ruta=url.pathname;
      if(RUTAS[ruta]){
        let crudo='';
        for await(const trozo of req)crudo+=trozo;
        let body;
        if(crudo){try{body=JSON.parse(crudo);}catch{body={};}}
        const peticion={method:req.method,headers:req.headers,query:Object.fromEntries(url.searchParams),body};
        const salida=respuestaCompatible(res);
        const modulo=await import(RUTAS[ruta]);
        await modulo.default(peticion,salida);
        return;
      }
      const rel=(ruta==='/'?'/index.html':ruta).replace(/^\/+/,'');
      if(rel.includes('..')){res.writeHead(403);return res.end('Prohibido');}
      const archivo=path.join(RAIZ,'public',rel);
      const datos=await readFile(archivo);
      res.writeHead(200,{'Content-Type':TIPOS[path.extname(archivo)]||'application/octet-stream'});
      res.end(datos);
    }catch(err){
      if(res.writableEnded)return;
      const codigo=err?.code==='ENOENT'?404:500;
      res.writeHead(codigo,{'Content-Type':'application/json; charset=utf-8'});
      res.end(JSON.stringify({ok:false,error:codigo===404?'No encontrado':'Error interno. Revisa la terminal.'}));
      if(codigo===500)console.error('servidor-local:',err);
    }
  });
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const cargadas=await cargarEnv();
  const puerto=Number(process.env.PUERTO)||3000;
  crearServidor().listen(puerto,()=>{
    console.log(`Listo en http://localhost:${puerto}`);
    console.log(cargadas?`Cargadas ${cargadas} variables desde .env.local`:'Sin .env.local: copia .env.example a .env.local y llena los valores.');
    if(!process.env.DATABASE_URL)console.log('Falta DATABASE_URL');
    if(!process.env.GROQ_API_KEY)console.log('Falta GROQ_API_KEY');
  });
}
