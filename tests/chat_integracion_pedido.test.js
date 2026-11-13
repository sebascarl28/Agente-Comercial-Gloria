import test from 'node:test';
import assert from 'node:assert/strict';
import * as nodeModule from 'node:module';

// Se prueba el handler con Groq y base de datos simulados, sin servicios externos.
test('El chat no crea las líneas equivocadas y permite consultar el precio sin alterarlas',{skip:!nodeModule.registerHooks},async()=>{
 const savedKey=process.env.GROQ_API_KEY;delete process.env.GROQ_API_KEY;
 const session={id_conversacion:'11111111-1111-4111-8111-111111111111',mensajes:[],id_cotizacion:null};
 const catalogo=[{id_producto:'PRD-002',nombre:'Evaporada',precio:'58.00'},{id_producto:'PRD-003',nombre:'Fresca',precio:'62.00'}];
 const mock={q:null,creadas:[],async enSimulacion(req,fn){return fn();},async uno(){return session;},
  async consulta(sql,args){if(sql.startsWith('UPDATE conversaciones')){session.mensajes=JSON.parse(args[1]);session.id_cotizacion=args[2];return [];}if(sql.includes('FROM productos'))return catalogo;return [];},
  async contextoCliente(){return {cliente:{razon_social:'Cliente prueba',linea_credito:30000},direcciones:[],creditos:[]};},
  async detalleCotizacion(){return this.q;},
  async crearCotizacionLineas(id,items){
    this.creadas.push(structuredClone(items));
    this.q={id_cotizacion:'22222222-2222-4222-8222-222222222222',id_cliente:id,estado:'BORRADOR',cantidad:items.reduce((n,x)=>n+x.cantidad,0),
      id_producto:items[0].id,items:items.map(x=>({id_producto:x.id,cantidad:x.cantidad,producto_nombre:catalogo.find(p=>p.id_producto===x.id).nombre,disponibilidad:{disponibles:1000,planificadas:0}}))};return this.q;
  }};
 globalThis.__testChat=mock;
 const dbCode="export const enSimulacion=(...a)=>globalThis.__testChat.enSimulacion(...a); export const uno=(...a)=>globalThis.__testChat.uno(...a); export const consulta=(...a)=>globalThis.__testChat.consulta(...a);";
 const serviceNames=['contextoCliente','crearCotizacion','crearCotizacionLineas','modificarCotizacion','detalleCotizacion','solicitarDescuento','proponerEntrega','confirmarDireccion','definirPago','confirmarPedido','clienteRespondeDescuento','clienteRespondeCredito','aceptarEntrega','disponibilidad','cambiarLinea','cambiarLineas'];
 const serviceCode=serviceNames.map(n=>`export const ${n}=(...a)=>globalThis.__testChat.${n}(...a);`).join('\n');
 const asUrl=x=>'data:text/javascript,'+encodeURIComponent(x);
 const hook=nodeModule.registerHooks({resolve(specifier,context,next){
   if(context.parentURL?.includes('/api/chat.js')&&specifier==='../lib/db.js')return {url:asUrl(dbCode),shortCircuit:true};
   if(context.parentURL?.includes('/api/chat.js')&&specifier==='../lib/service.js')return {url:asUrl(serviceCode),shortCircuit:true};
   return next(specifier,context);
 }});
 try{
  const {default:handler}=await import('../api/chat.js?test_pedido');
  async function enviar(mensaje){
   const req={method:'POST',headers:{},body:{mensaje,id_cliente:'CLI-LA-001',id_conversacion:session.id_conversacion}};
   let body;const res={setHeader(){},end(x){body=JSON.parse(x);}};
   await handler(req,res);assert.equal(res.statusCode,200,JSON.stringify(body));return body;
  }
  const a=await enviar('ok si quiero pedir 50 cajas de leche evaoporada y 30 de leche fresca?');
  assert.match(a.respuesta,/50 cajas de leche evaporada.*30 cajas de leche fresca/);assert.equal(mock.creadas.length,0);
  const precioPrevio=await enviar('¿Cuánto cuesta una caja de leche fresca?');
  assert.match(precioPrevio.respuesta,/Fresca:.*62\.00/);assert.equal(mock.creadas.length,0);
  const b=await enviar('Sí');assert.equal(mock.creadas.length,1);
  assert.deepEqual(mock.creadas[0],[{id:'PRD-002',cantidad:50},{id:'PRD-003',cantidad:30}]);
  assert.deepEqual(b.cotizacion.items.map(x=>x.cantidad),[50,30]);
  const c=await enviar('¿Cuánto cuesta una caja de leche fresca?');
  assert.match(c.respuesta,/Fresca:.*62\.00/);assert.equal(mock.creadas.length,1);
  assert.deepEqual(c.cotizacion.items.map(x=>x.cantidad),[50,30]);
  // Reproduce la conversación reportada: no confundir variedades con cajas.
  session.mensajes=[];session.id_cotizacion=null;mock.q=null;mock.creadas=[];
  await enviar('buenas quiero pedir varios productos, que ofreces?');
  const ambiguo=await enviar('quiero 3 lecehes evaporada y fresca');
  assert.match(ambiguo.respuesta,/tipos de leche o cajas/);assert.equal(mock.creadas.length,0);
  const correccion=await enviar('no, quiero 10 cajas de evaporada y 20 de fressca');
  assert.match(correccion.respuesta,/10 cajas de leche evaporada.*20 cajas de leche fresca/);assert.equal(mock.creadas.length,0);
  await enviar('Sí');assert.deepEqual(mock.creadas[0],[{id:'PRD-002',cantidad:10},{id:'PRD-003',cantidad:20}]);
 }finally{hook.deregister();delete globalThis.__testChat;if(savedKey!==undefined)process.env.GROQ_API_KEY=savedKey;}
});
