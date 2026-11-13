import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {pideNuevaCotizacion,preguntaLimiteDescuento} from '../lib/ciclo-cotizacion.js';
import {pidePrecio} from '../lib/precios-conversacion.js';
import {cantidadExplicita} from '../lib/dialogo.js';
import {extraerProductos} from '../lib/seleccion-productos.js';

test('Distingue descuento máximo con errores de escritura de los precios',()=>{
 for(const t of ['cuanto es el maximo dscuento que puedes darme?','¿Hasta cuánto descuento puedes darme?','¿Cuál es el máximo porcentaje de descuento?']){
  assert.equal(preguntaLimiteDescuento(t),true);assert.equal(pidePrecio(t),false);
 }
 for(const t of ['Quiero 8% de descuento','¿Cuánto descuento tengo?','¿Cuánto es el total con descuento?'])assert.equal(preguntaLimiteDescuento(t),false);
 assert.equal(pidePrecio('¿Cuánto sale una caja de fresca?'),true);
});
test('Conserva cantidades al confirmar una variedad con error de escritura',()=>{
 assert.equal(cantidadExplicita('20 de leche evaprada'),20);
 assert.deepEqual(extraerProductos('20 de evaporada y para fresca una 10').map(({id,cantidad})=>({id,cantidad})),[{id:'PRD-002',cantidad:20},{id:'PRD-003',cantidad:10}]);
});
test('Consultar un pedido o negar otra compra no abre una cotización',()=>{
 for(const t of ['¿Cómo va mi pedido?','¿Ya respondió Jefatura?','No quiero otro pedido','Confirmar pedido'])assert.equal(pideNuevaCotizacion(t,{estado:'CONFIRMADA'}),false);
 assert.equal(pideNuevaCotizacion('¿Puedo añadir otro producto?',{estado:'CONFIRMADA'}),true);
 assert.equal(pideNuevaCotizacion('quiero pedir otro producto con otra cotizacion',{estado:'CONFIRMADA'}),true);
 assert.equal(pideNuevaCotizacion('¿Puedo añadir otro producto?',{estado:'BORRADOR'}),false);
});

test('El handler inicia otra cotización y mantiene el pedido registrado, incluso con ID antiguo del navegador',async()=>{
 const key=process.env.GROQ_API_KEY;delete process.env.GROQ_API_KEY;
 const idOld='22222222-2222-4222-8222-222222222222',idS='11111111-1111-4111-8111-111111111111';
 const producto=id=>({'PRD-001':'UHT','PRD-002':'Evaporada','PRD-003':'Fresca'}[id]);
 const old={id_cotizacion:idOld,id_cliente:'CLI-LA-001',estado:'CONFIRMADA',version:5,id_producto:'PRD-001',cantidad:70,producto_nombre:'UHT y Fresca',descuento_pct:8,total:4602.94,forma_pago:'CREDITO',direccion_confirmada:true,entrega_aceptada:true,items:[{id_producto:'PRD-001',cantidad:50},{id_producto:'PRD-003',cantidad:20}],entregas:[{id_producto:'PRD-001',cajas:50,fecha:'2026-11-14',origen:'STOCK'},{id_producto:'PRD-003',cajas:20,fecha:'2026-11-14',origen:'STOCK'}]};
 const original=structuredClone(old),quotes=new Map([[idOld,old]]);
 const session={id_conversacion:idS,id_cotizacion:idOld,mensajes:[{rol:'agente',texto:'Pedido registrado',estado_chat:{esperando:'PEDIDO_CONFIRMADO',producto:'PRD-003',descuento_consultado:true,confirmacion_final:'vieja',cantidad_pendiente:99}}]};
 let n=0;
 const mock={async enSimulacion(req,fn){return fn();},async uno(){return session;},async consulta(sql,args){if(sql.startsWith('UPDATE conversaciones')){session.mensajes=JSON.parse(args[1]);session.id_cotizacion=args[2];}return [];},async contextoCliente(){return {cliente:{razon_social:'Prueba',linea_credito:30000},creditos:[],direcciones:[],pedidos:[]};},async detalleCotizacion(id){assert.ok(quotes.has(id));return structuredClone(quotes.get(id));},async crearCotizacion(cliente,id,cantidad){return this.crearCotizacionLineas(cliente,[{id,cantidad}]);},async crearCotizacionLineas(cliente,items){const id=`33333333-3333-4333-8333-${String(++n).padStart(12,'0')}`;const q={id_cotizacion:id,id_cliente:cliente,estado:'BORRADOR',version:1,id_producto:items[0].id,producto_nombre:items.map(x=>producto(x.id)).join(' y '),cantidad:items.reduce((a,x)=>a+x.cantidad,0),descuento_pct:0,total:0,forma_pago:'SIN_DEFINIR',entrega_aceptada:false,direccion_confirmada:false,aprobaciones:[],entregas:[],items:items.map(x=>({id_producto:x.id,cantidad:x.cantidad,producto_nombre:producto(x.id),disponibilidad:{disponibles:500,planificadas:0}})),disponibilidad:{disponibles:500,planificadas:0}};quotes.set(id,q);return structuredClone(q);}};
 globalThis.__nuevoChat=mock;
 const dbCode="export const enSimulacion=(...a)=>globalThis.__nuevoChat.enSimulacion(...a);export const uno=(...a)=>globalThis.__nuevoChat.uno(...a);export const consulta=(...a)=>globalThis.__nuevoChat.consulta(...a);";
 const names=['contextoCliente','crearCotizacion','crearCotizacionLineas','modificarCotizacion','detalleCotizacion','solicitarDescuento','proponerEntrega','confirmarDireccion','definirPago','confirmarPedido','clienteRespondeDescuento','clienteRespondeCredito','aceptarEntrega','disponibilidad','cambiarLinea','cambiarLineas'];
 const serviceCode=names.map(name=>`export const ${name}=(...a)=>{if(!globalThis.__nuevoChat.${name})throw Error('No se permite modificar el pedido anterior: ${name}');return globalThis.__nuevoChat.${name}(...a);};`).join('\n');
 const hook=registerHooks({resolve(spec,ctx,next){if(ctx.parentURL?.includes('/api/chat.js') && ['../lib/db.js','../lib/service.js'].includes(spec))return {url:'data:text/javascript,'+encodeURIComponent(spec.endsWith('db.js')?dbCode:serviceCode),shortCircuit:true};return next(spec,ctx);}});
 try{
  const {default:handler}=await import('../api/chat.js?nueva');
  async function enviar(mensaje){let result;const res={setHeader(){},end(x){result=JSON.parse(x);}};await handler({method:'POST',headers:{},body:{mensaje,id_cliente:'CLI-LA-001',id_conversacion:idS,id_cotizacion:idOld}},res);assert.equal(res.statusCode,200,JSON.stringify(result));assert.doesNotMatch(result.respuesta,/No pude registrar|cotización cambió/);assert.deepEqual(quotes.get(idOld),original);return result;}
  const status=await enviar('¿Cómo va mi cotización?');assert.equal(status.cotizacion.id_cotizacion,idOld);
  const inicio=await enviar('¿Puedo añadir otro producto?');assert.equal(inicio.cotizacion,null);assert.equal(session.id_cotizacion,null);assert.match(inicio.respuesta,/nueva cotización/);
  const dudosa=await enviar('20 de leche evaprada');assert.match(dudosa.respuesta,/evaporada/);assert.equal(quotes.size,1);
  const primera=await enviar('Sí');assert.equal(primera.cotizacion.cantidad,20);assert.equal(primera.cotizacion.items[0].id_producto,'PRD-002');assert.notEqual(primera.cotizacion.id_cotizacion,idOld);assert.equal(primera.cotizacion.descuento_pct,0);assert.equal(primera.cotizacion.forma_pago,'SIN_DEFINIR');
  const max=await enviar('cuanto es el maximo dscuento que puedes darme?');assert.match(max.respuesta,/5%.*12%/);assert.doesNotMatch(max.respuesta,/Precios de lista/);assert.deepEqual(max.cotizacion,primera.cotizacion);
  await enviar('quiero pedir otro producto con otra cotizacion');
  await enviar('evaporada y fresca');
  const consulta=await enviar('¿Cómo va mi cotización?');assert.match(consulta.respuesta,/evaporada: cantidad pendiente.*fresca: cantidad pendiente/);
  const respuesta=await enviar('20 de evaporada y para fresca una 10');
  const segunda=respuesta.cotizacion?respuesta:await enviar('Sí');
  assert.deepEqual(segunda.cotizacion.items.map(x=>[x.id_producto,x.cantidad]),[['PRD-002',20],['PRD-003',10]]);
  assert.notEqual(segunda.cotizacion.id_cotizacion,primera.cotizacion.id_cotizacion);
  const idSegunda=segunda.cotizacion.id_cotizacion;quotes.get(idSegunda).estado='CONFIRMADA';
  const tercera=await enviar('Quiero agregar 15 cajas de leche UHT');
  assert.notEqual(tercera.cotizacion.id_cotizacion,idSegunda);assert.equal(tercera.cotizacion.cantidad,15);
  const estado=session.mensajes.at(-1).estado_chat;assert.equal(estado.descuento_consultado,false);assert.equal(estado.confirmacion_final,undefined);
 }finally{hook.deregister();delete globalThis.__nuevoChat;if(key!==undefined)process.env.GROQ_API_KEY=key;}
});
