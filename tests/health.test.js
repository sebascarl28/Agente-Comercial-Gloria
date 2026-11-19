import test from 'node:test';
import assert from 'node:assert/strict';
import handler,{verificarGroq} from '../api/health.js';

function conservar(nombre){
  const valor=process.env[nombre];
  return ()=>valor===undefined?delete process.env[nombre]:process.env[nombre]=valor;
}

test('health: sin clave reporta sin_clave sin llamar a Groq',async()=>{
  const restaurar=conservar('GROQ_API_KEY');
  delete process.env.GROQ_API_KEY;
  try{
    const r=await verificarGroq(100,async()=>{throw new Error('no debería llamar');});
    assert.equal(r.ok,false);assert.equal(r.estado,'sin_clave');
  }finally{restaurar();}
});

test('health: valida la clave con /models sin consumir generación',async()=>{
  const restaurarKey=conservar('GROQ_API_KEY'),restaurarModelo=conservar('GROQ_MODEL');
  process.env.GROQ_API_KEY='clave-de-prueba';process.env.GROQ_MODEL='openai/gpt-oss-120b';
  const llamadas=[];
  const fetchFn=async(url,opts)=>{
    llamadas.push(url);
    assert.match(url,/api\.groq\.com\/openai\/v1\/models$/);
    assert.equal(opts.headers.Authorization,'Bearer clave-de-prueba');
    return new Response(JSON.stringify({data:[{id:'openai/gpt-oss-120b'},{id:'llama-3.3-70b-versatile'}]}),{status:200});
  };
  try{
    const r=await verificarGroq(100,fetchFn);
    assert.equal(llamadas.length,1);assert.equal(r.ok,true);
    assert.equal(r.modelo_valido,true);assert.equal(r.estado,'ok');
  }finally{restaurarKey();restaurarModelo();}
});

test('health: una clave inválida informa el código sin exponer la clave',async()=>{
  const restaurar=conservar('GROQ_API_KEY');process.env.GROQ_API_KEY='clave-de-prueba';
  const fetchFn=async()=>new Response(JSON.stringify({error:{code:'invalid_api_key'}}),{status:401});
  try{
    const r=await verificarGroq(100,fetchFn);
    assert.equal(r.ok,false);assert.equal(r.estado,'http_401');
    assert.equal(r.detalle,'invalid_api_key');
    assert.doesNotMatch(JSON.stringify(r),/clave-de-prueba/);
  }finally{restaurar();}
});

test('health: un modelo configurado inexistente se marca y sugiere alternativas',async()=>{
  const restaurarKey=conservar('GROQ_API_KEY'),restaurarModelo=conservar('GROQ_MODEL');
  process.env.GROQ_API_KEY='clave-de-prueba';process.env.GROQ_MODEL='modelo-que-no-existe';
  const fetchFn=async()=>new Response(JSON.stringify({data:[{id:'openai/gpt-oss-20b'}]}),{status:200});
  try{
    const r=await verificarGroq(100,fetchFn);
    assert.equal(r.ok,true);assert.equal(r.modelo_valido,false);
    assert.deepEqual(r.modelos_sugeridos,['openai/gpt-oss-20b']);
  }finally{restaurarKey();restaurarModelo();}
});

test('health: el endpoint responde JSON con la bandera ok',async()=>{
  const restaurarKey=conservar('GROQ_API_KEY'),restaurarDb=conservar('DATABASE_URL');
  delete process.env.GROQ_API_KEY;delete process.env.DATABASE_URL;
  let salida;
  const res={statusCode:0,setHeader(){},end(cuerpo){salida={status:this.statusCode,cuerpo:JSON.parse(cuerpo)};}};
  try{
    await handler({method:'GET'},res);
    assert.equal(salida.status,200);
    assert.equal(typeof salida.cuerpo.ok,'boolean');
    assert.equal(salida.cuerpo.groq.estado,'sin_clave');
    assert.equal(salida.cuerpo.base.ok,false);
    assert.doesNotMatch(JSON.stringify(salida.cuerpo),/Bearer|postgres:\/\//);
  }finally{restaurarKey();restaurarDb();}
});
