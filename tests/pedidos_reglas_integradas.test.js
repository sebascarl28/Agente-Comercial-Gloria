import test from 'node:test';
import assert from 'node:assert/strict';
import * as nodeModule from 'node:module';
import {ejecutarEnEscenarioPC3} from '../lib/escenario.js';

// Ejecuta confirmarPedido real con consultas y transacciones simuladas.
test('Confirmación real del servicio reserva stock y distingue producción condicionada',{skip:!nodeModule.registerHooks},async()=>{
 const ids=['PRD-001','PRD-002','PRD-003'];
 const precios=[60,58,62],costos=[46,43,42],minimos=[15,15,25];
 const mkLineas=cants=>ids.map((id,i)=>({id_producto:id,cantidad:cants[i],precio_unitario:precios[i],costo:costos[i],margen_minimo:minimos[i],producto_nombre:id})).filter(x=>x.cantidad);
 const lotes=[{id_producto:ids[0],id_lote:'UHT',cajas:250},{id_producto:ids[1],id_lote:'EVA',cajas:40},{id_producto:ids[2],id_lote:'FRE',cajas:120}];
 const planes=[{id_producto:ids[1],id_plan:'OP-EVA-1711',cajas:20,fecha_disponibilidad:'2026-11-17'}];
 const partes=[{id_producto:ids[0],cajas:180,fecha:'2026-11-16',origen:'STOCK'},{id_producto:ids[1],cajas:40,fecha:'2026-11-16',origen:'STOCK'},{id_producto:ids[2],cajas:120,fecha:'2026-11-16',origen:'STOCK'},{id_producto:ids[1],cajas:20,fecha:'2026-11-17',origen:'PRODUCCION'}];
 const datos={lineas:mkLineas([180,60,120]),q:{id_cliente:'CLI-LA-001',estado:'EN_NEGOCIACION',direccion_confirmada:true,entrega_aceptada:true,forma_pago:'CREDITO',entregas:partes,descuento_pct:8,total:23579.23,cantidad:360,linea_credito:30000,deuda_vigente:0,plazo_credito_dias:30},pendiente:false,reservas:[],produccion:[],entregas:[],pedido:null,commits:0,rollbacks:0};
 const cn={async query(sql,args=[]){
  if(sql==='BEGIN')return {rows:[]};
  if(sql==='COMMIT'){datos.commits++;return {rows:[]};}
  if(sql==='ROLLBACK'){datos.rollbacks++;return {rows:[]};}
  if(sql.includes('FOR UPDATE OF q,c'))return {rows:[datos.q]};
  if(sql.startsWith('SELECT 1 FROM solicitudes_descuento'))return {rows:[],rowCount:datos.pendiente?1:0};
  if(sql.includes('FROM cotizacion_detalle d JOIN productos'))return {rows:datos.lineas};
  if(sql.startsWith('SELECT * FROM stock_lotes'))return {rows:lotes.filter(x=>args[0].includes(x.id_producto))};
  if(sql.startsWith('SELECT * FROM plan_produccion'))return {rows:planes.filter(x=>args[0].includes(x.id_producto))};
  if(sql.startsWith('SELECT COALESCE(SUM(cajas),0)::int usados'))return {rows:[{usados:0}]};
  if(sql.startsWith('INSERT INTO pedidos')){datos.pedido={id_pedido:'PED-01',estado:args[2],total:args[3]};return {rows:[datos.pedido]};}
  if(sql.startsWith('INSERT INTO entregas')){datos.entregas.push({producto:args[1],cajas:args[3],origen:args[5],estado:args[6]});return {rows:[]};}
  if(sql.startsWith('INSERT INTO pagos'))return {rows:[]};
  if(sql.startsWith('INSERT INTO reservas_stock')){datos.reservas.push({id:args[1],cajas:args[2]});return {rows:[]};}
  if(sql.startsWith('INSERT INTO asignaciones_produccion')){datos.produccion.push({id:args[1],cajas:args[2]});return {rows:[]};}
  if(sql.startsWith('UPDATE clientes'))return {rows:[]};
  if(sql.startsWith('UPDATE cotizaciones'))return {rows:[]};
  throw Error(`Consulta no simulada: ${sql}`);
 },release(){}};
 globalThis.__pedidoTx={db:()=>({connect:async()=>cn})};
 const dbCode='export const db=(...a)=>globalThis.__pedidoTx.db(...a);export const uno=async()=>null;export const consulta=async()=>[];';
 const hook=nodeModule.registerHooks({resolve(specifier,ctx,next){if(ctx.parentURL?.includes('/lib/service.js')&&specifier==='./db.js')return {url:'data:text/javascript,'+encodeURIComponent(dbCode),shortCircuit:true};return next(specifier,ctx);}});
 try{
  const {confirmarPedido}=await import('../lib/service.js?pedido_reglas');
  await ejecutarEnEscenarioPC3(true,async()=>{
   datos.pendiente=true;await assert.rejects(()=>confirmarPedido('11111111-1111-4111-8111-111111111111'),/Falta Jefatura/);
   assert.equal(datos.commits,0);assert.equal(datos.reservas.length,0);
   datos.pendiente=false;
   const r=await confirmarPedido('11111111-1111-4111-8111-111111111111');
   assert.equal(r.pedido.estado,'PROGRAMADO_CONDICIONAL');assert.equal(r.pedido.total,23579.23);
   assert.equal(datos.reservas.reduce((n,x)=>n+x.cajas,0),340);
   assert.deepEqual(datos.produccion,[{id:'OP-EVA-1711',cajas:20}]);
   assert.equal(datos.entregas.find(x=>x.origen==='PRODUCCION').estado,'PROGRAMADA_CONDICIONAL');
   assert.equal(datos.commits,1);assert.equal(datos.rollbacks,1);
  });
 }finally{hook.deregister();delete globalThis.__pedidoTx;}
});
