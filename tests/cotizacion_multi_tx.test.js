import test from 'node:test';
import assert from 'node:assert/strict';
import * as nodeModule from 'node:module';

// Simula las consultas para comprobar el límite de la transacción, sin Supabase.
test('La cotización multiproducto se confirma completa o se revierte',{skip:!nodeModule.registerHooks},async()=>{
 const productos={
  'PRD-002':{id_producto:'PRD-002',nombre:'Evaporada',precio:58,costo:43,margen_minimo:15},
  'PRD-003':{id_producto:'PRD-003',nombre:'Fresca',precio:62,costo:42,margen_minimo:25}
 };
 const m={lineas:[],q:null,commits:0,rollbacks:0,falta:null};
 const cn={async query(sql,args=[]){
  if(sql==='BEGIN'){m.lineas=[];m.q=null;return {rows:[]};}
  if(sql==='ROLLBACK'){m.lineas=[];m.q=null;m.rollbacks++;return {rows:[]};}
  if(sql==='COMMIT'){m.commits++;return {rows:[]};}
  if(sql.startsWith('SELECT id_cliente'))return {rows:[{id_cliente:args[0]}]};
  if(sql.startsWith('SELECT id_direccion'))return {rows:[{id_direccion:'DIR-01'}]};
  if(sql.startsWith('SELECT * FROM productos'))return {rows:args[0]===m.falta?[]:[productos[args[0]]].filter(Boolean)};
  if(sql.startsWith('INSERT INTO cotizaciones(')){m.q={id_cotizacion:'22222222-2222-4222-8222-222222222222',id_cliente:args[0],id_producto:args[2],cantidad:args[3],subtotal:args[4],igv:args[5],total:args[6],version:1,estado:'BORRADOR'};return {rows:[m.q]};}
  if(sql.startsWith('INSERT INTO cotizacion_detalle')){m.lineas.push({id_detalle:m.lineas.length+1,id_producto:args[1],cantidad:args[2],precio_unitario:args[3],...productos[args[1]],producto_nombre:productos[args[1]].nombre});return {rows:[]};}
  if(sql.includes('FROM cotizacion_detalle d JOIN productos'))return {rows:m.lineas};
  if(sql.startsWith('UPDATE cotizacion_detalle SET subtotal'))return {rows:[]};
  if(sql.startsWith('UPDATE cotizaciones SET id_producto')){Object.assign(m.q,{id_producto:args[1],cantidad:args[2],subtotal:args[4],igv:args[5],total:args[6],version:2});return {rows:[m.q]};}
  if(sql.startsWith('INSERT INTO historial_cotizaciones'))return {rows:[]};
  throw Error(`Consulta no simulada: ${sql}`);
 },release(){}};
 m.db=()=>({connect:async()=>cn});
 m.uno=async()=>m.q;
 m.consulta=async(sql)=>sql.includes('FROM cotizacion_detalle d JOIN productos')?m.lineas:[];
 globalThis.__multiTx=m;
 const dbCode='export const db=(...a)=>globalThis.__multiTx.db(...a); export const uno=(...a)=>globalThis.__multiTx.uno(...a); export const consulta=(...a)=>globalThis.__multiTx.consulta(...a);';
 const hook=nodeModule.registerHooks({resolve(specifier,ctx,next){
  if(ctx.parentURL?.includes('/lib/service.js')&&specifier==='./db.js')return {url:'data:text/javascript,'+encodeURIComponent(dbCode),shortCircuit:true};
  return next(specifier,ctx);
 }});
 try{
  const {crearCotizacionLineas}=await import('../lib/service.js?test_multi_tx');
  const items=[{id:'PRD-002',cantidad:50},{id:'PRD-003',cantidad:30}];
  const q=await crearCotizacionLineas('CLI-LA-001',items);
  assert.equal(m.commits,1);assert.deepEqual(q.items.map(x=>x.cantidad),[50,30]);assert.equal(q.calculo.total,5616.8);
  m.falta='PRD-003';
  await assert.rejects(()=>crearCotizacionLineas('CLI-LA-001',items),/Producto inexistente/);
  assert.equal(m.rollbacks,1);assert.equal(m.commits,1);assert.deepEqual(m.lineas,[]);assert.equal(m.q,null);
 }finally{hook.deregister();delete globalThis.__multiTx;}
});
