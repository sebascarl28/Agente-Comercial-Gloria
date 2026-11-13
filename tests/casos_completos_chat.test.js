import test from 'node:test';
import assert from 'node:assert/strict';
import * as nodeModule from 'node:module';
import {calcularLineas} from '../lib/multiproducto.js';
import {ejecutarEnEscenarioPC3} from '../lib/escenario.js';

// El handler es real; Groq y la persistencia ERP/CRM están simulados. El cálculo
// y las reglas comerciales usan los módulos reales del proyecto.
test('Recorridos manuales completos: normal, PC3 y aprobación de Jefatura',{skip:!nodeModule.registerHooks},async()=>{
 const key=process.env.GROQ_API_KEY,DateReal=globalThis.Date;
 delete process.env.GROQ_API_KEY;
 globalThis.Date=class extends DateReal {constructor(...args){super(...(args.length?args:['2026-11-13T18:00:00Z']));}static now(){return new DateReal('2026-11-13T18:00:00Z').getTime();}};
 const defs={
  'PRD-001':{nombre:'Leche UHT Gloria Entera 1 L',precio:60,costo:46,margen_minimo:15},
  'PRD-002':{nombre:'Leche Evaporada Gloria 400 g',precio:58,costo:43,margen_minimo:15},
  'PRD-003':{nombre:'Leche Fresca Gloria 1 L',precio:62,costo:42,margen_minimo:25}
 };
 const idQ='22222222-2222-4222-8222-222222222222',idS='11111111-1111-4111-8111-111111111111';
 const m={q:null,sesion:null,pc3:false,stock:null,asignaciones:[],reiniciar(pc3){
  this.q=null;this.pc3=pc3;this.asignaciones=[];
  this.sesion={id_conversacion:idS,mensajes:[],id_cotizacion:null};
  this.stock=pc3?{'PRD-001':250,'PRD-002':40,'PRD-003':120}:{'PRD-001':250,'PRD-002':300,'PRD-003':90};
 },
 async enSimulacion(req,fn){return ejecutarEnEscenarioPC3(req.headers['x-demo-scenario']==='pc3',fn);},
 async uno(){return this.sesion;},
 async consulta(sql,args=[]){if(sql.startsWith('UPDATE conversaciones')){this.sesion.mensajes=JSON.parse(args[1]);this.sesion.id_cotizacion=args[2];}return [];},
 async contextoCliente(){return {cliente:{razon_social:'La Alameda',linea_credito:30000,plazo_credito_dias:30},creditos:[],direcciones:[{id_direccion:'DIR-LA-01',direccion:'Av. Ejemplo 2450',distrito:'Ate',principal:true}],pedidos:[]};},
 actualizar(){
  const q=this.q;if(!q)return null;
  q.items=q.items.map(x=>({...x,disponibilidad:this.stockItem(x.id_producto)}));q.disponibilidad=q.items[0].disponibilidad;
  const c=calcularLineas(q.items.map(x=>({...x,...defs[x.id_producto],precio_unitario:defs[x.id_producto].precio,producto_nombre:defs[x.id_producto].nombre})),q.descuento_pct);
  Object.assign(q,{cantidad:c.cantidad,total:c.total,subtotal:c.subtotal,igv:c.igv,calculo:{total:c.total,subtotal:c.subtotal,igv:c.igv},producto_nombre:q.items.map(x=>defs[x.id_producto].nombre).join(' + ')});
  return structuredClone(q);
 },
 stockItem(id){const plan=id==='PRD-002'&&this.pc3?20:0;return {disponibles:this.stock[id],planificadas:plan,planes:plan?[{libres:20,fecha_disponibilidad:'2026-11-17'}]:[],lotes:[]};},
 async disponibilidad(id){return this.stockItem(id);},
 async detalleCotizacion(){return this.actualizar();},
 async crearCotizacion(cliente,id,n){this.q={id_cotizacion:idQ,id_cliente:cliente,id_producto:id,estado:'BORRADOR',version:1,items:[{id_producto:id,cantidad:n,producto_nombre:defs[id].nombre}],descuento_pct:0,entregas:[],entrega_aceptada:false,forma_pago:'SIN_DEFINIR',direccion:'Av. Ejemplo 2450',distrito:'Ate',id_direccion:'DIR-LA-01',direccion_confirmada:false,linea_credito:30000,deuda_vigente:0,aprobaciones:[]};return this.actualizar();},
 async crearCotizacionLineas(cliente,items){await this.crearCotizacion(cliente,items[0].id,items[0].cantidad);for(const x of items.slice(1))await this.cambiarLinea(idQ,x.id,x.cantidad,{modo:'AGREGAR'});return this.actualizar();},
 async cambiarLinea(id,prod,n,{modo}={}){let x=this.q.items.find(y=>y.id_producto===prod);if(x)x.cantidad=modo==='AGREGAR'?x.cantidad+n:n;else this.q.items.push({id_producto:prod,cantidad:n,producto_nombre:defs[prod].nombre});this.q.version++;return this.actualizar();},
 async proponerEntrega(id,datos){
  let partes;if(this.pc3&&this.q.items.length===3&&datos.modo==='DOS_PARTES')partes=[{id_producto:'PRD-001',cajas:180,fecha:'2026-11-16',origen:'STOCK'},{id_producto:'PRD-002',cajas:40,fecha:'2026-11-16',origen:'STOCK'},{id_producto:'PRD-003',cajas:120,fecha:'2026-11-16',origen:'STOCK'},{id_producto:'PRD-002',cajas:20,fecha:'2026-11-17',origen:'PRODUCCION'}];
  else partes=this.q.items.map(x=>({id_producto:x.id_producto,cajas:x.cantidad,fecha:datos.fecha,origen:'STOCK'}));
  this.q.entregas=partes;this.q.entrega_aceptada=false;this.q.version++;
  return {mensaje:`Propuesta: ${partes.map(x=>`${x.cajas} cajas ${x.fecha}`).join('; ')}. Sujeta a logística y Calidad. ¿La aceptas?`,cotizacion:this.actualizar()};
 },
 async aceptarEntrega(){this.q.entrega_aceptada=true;this.q.version++;return {mensaje:'Se aceptó el esquema de entrega propuesto.',cotizacion:this.actualizar()};},
 async definirPago(id,modo){this.q.forma_pago=modo;return {mensaje:modo==='CONTADO'?'Se seleccionó pago al contado.':'Se seleccionó crédito dentro de la línea aprobada.',cotizacion:this.actualizar()};},
 async confirmarDireccion(){this.q.direccion_confirmada=true;this.q.version++;return {mensaje:'Dirección confirmada: Av. Ejemplo 2450, Ate.',cotizacion:this.actualizar()};},
 async solicitarDescuento(id,pct){this.q.aprobaciones=[{id_solicitud:'DESC-1',estado:'PENDIENTE_JEFATURA',solicitado_pct:pct}];this.q.estado='PENDIENTE_JEFATURA';return {mensaje:`Envié tu solicitud de ${pct} % a Jefatura Comercial.`,cotizacion:this.actualizar()};},
 async decidirDescuento(id,decision,pct){const s=this.q.aprobaciones[0];assert.equal(s.estado,'PENDIENTE_JEFATURA');assert.equal(decision,'APROBAR');calcularLineas(this.q.items.map(x=>({...x,...defs[x.id_producto],precio_unitario:defs[x.id_producto].precio})),pct);s.estado='OFERTADO';s.ofrecido_pct=Number(pct);return {mensaje:'Jefatura autorizó ofrecer el descuento.'};},
 async clienteRespondeDescuento(id,acepta){assert.equal(acepta,true);this.q.aprobaciones[0].estado='ACEPTADA_CLIENTE';this.q.descuento_pct=this.q.aprobaciones[0].ofrecido_pct;this.q.estado='EN_NEGOCIACION';this.q.version++;return {mensaje:`Aceptaste el descuento de ${this.q.descuento_pct} %.`,cotizacion:this.actualizar()};},
 async confirmarPedido(){
  assert.equal(this.q.entrega_aceptada,true);assert.equal(this.q.direccion_confirmada,true);assert.notEqual(this.q.forma_pago,'SIN_DEFINIR');
  assert.equal(this.q.aprobaciones.some(x=>['PENDIENTE_JEFATURA','OFERTADO'].includes(x.estado)),false);
  for(const p of this.q.entregas){if(p.origen==='STOCK'){assert.ok(this.stock[p.id_producto]>=p.cajas);this.stock[p.id_producto]-=p.cajas;}else this.asignaciones.push(p);}
  this.q.estado='CONFIRMADA';this.q.version++;
  return {mensaje:this.asignaciones.length?'Pedido registrado con producción CONDICIONAL, sujeta a Calidad y logística.':'Pedido registrado; despachos sujetos a logística.'};
 }};
 m.reiniciar(false);globalThis.__casosChat=m;
 const dbCode="export const enSimulacion=(...a)=>globalThis.__casosChat.enSimulacion(...a);export const uno=(...a)=>globalThis.__casosChat.uno(...a);export const consulta=(...a)=>globalThis.__casosChat.consulta(...a);";
 const names=['contextoCliente','crearCotizacion','crearCotizacionLineas','modificarCotizacion','detalleCotizacion','solicitarDescuento','proponerEntrega','confirmarDireccion','definirPago','confirmarPedido','clienteRespondeDescuento','clienteRespondeCredito','aceptarEntrega','disponibilidad','cambiarLinea','cambiarLineas','listarAprobaciones','decidirCredito','decidirDescuento'];
 const code=names.map(n=>`export const ${n}=(...a)=>globalThis.__casosChat.${n}(...a);`).join('\n');
 const url=x=>'data:text/javascript,'+encodeURIComponent(x);
 const hook=nodeModule.registerHooks({resolve(specifier,ctx,next){
  if((ctx.parentURL?.includes('/api/chat.js')||ctx.parentURL?.includes('/api/gestion.js'))&&specifier==='../lib/db.js')return {url:url(dbCode),shortCircuit:true};
  if((ctx.parentURL?.includes('/api/chat.js')||ctx.parentURL?.includes('/api/gestion.js'))&&specifier==='../lib/service.js')return {url:url(code),shortCircuit:true};
  return next(specifier,ctx);
 }});
 try{
  const {default:chat}=await import('../api/chat.js?casos_completos');
  const {default:gestion}=await import('../api/gestion.js?casos_completos');
  async function llamar(handler,body,headers={}){const req={method:'POST',headers:{'x-demo-scenario':m.pc3?'pc3':'normal',...headers},body};let result;const res={setHeader(){},end(x){result=JSON.parse(x);}};await handler(req,res);assert.equal(res.statusCode,200,JSON.stringify(result));return result;}
  const decir=async mensaje=>llamar(chat,{mensaje,id_cliente:'CLI-LA-001',id_conversacion:idS});
  const paso=async(texto,regex)=>{const r=await decir(texto);assert.match(r.respuesta,regex,`Al decir «${texto}» respondió: ${r.respuesta}`);return r;};
  // Reproduce el diálogo real de Sebastián, incluida la fecha expresada en palabras.
  await paso('buenas, quiero pedir varios productos',/leches|productos/i);
  await paso('quiero fresca y evaporada',/fresca.*evaporada/i);
  const cantidades=await paso('quiero 20 para frescas y para evaporada quiero 30',/20 cajas.*30 cajas/i);
  assert.deepEqual(cantidades.cotizacion.items.map(x=>[x.id_producto,x.cantidad]),[['PRD-003',20],['PRD-002',30]]);
  await paso('Lo antes posible',/fecha/i);
  await paso('para cuando esta disponible?',/fecha de referencia/i);
  await paso('la fecha?',/fecha de referencia/i);
  const fecha=await paso('para el 17 de este mes',/2026-11-17/);
  assert.deepEqual(fecha.cotizacion.items.map(x=>x.cantidad),[20,30]);
  await paso('Acepto la entrega',/contado|cr[eé]dito/i);
  const credito=await paso('Con mi crédito aprobado',/cr[eé]dito/i);
  assert.equal(credito.cotizacion.forma_pago,'CREDITO');
  m.reiniciar(false);
  // Al aceptar una fecha de referencia solo se crea una propuesta, no un pedido.
  await paso('Necesito 100 cajas de leche UHT',/100 cajas.*UHT/i);
  await paso('Lo antes posible',/fecha de referencia/i);
  const propuesta=await paso('Sí',/Propuesta/i);
  assert.equal(propuesta.cotizacion.entrega_aceptada,false);assert.equal(propuesta.cotizacion.estado,'BORRADOR');
  m.reiniciar(false);
  // Caso 1: venta normal completa.
  await paso('Necesito 100 cajas de leche UHT',/100 cajas.*UHT/i);
  await paso('Lo quiero para el 16 de noviembre de 2026',/100 cajas.*2026-11-16/i);
  await paso('Acepto',/acept[oó].*entrega/i);
  await paso('Pago al contado',/contado/i);
  await paso('Sin descuento',/direcci[oó]n/i);
  await paso('Confirmo la dirección',/Confirmas el pedido/i);
  const normal=await paso('Confirmar pedido',/CONFIRMADA/);
  assert.equal(normal.cotizacion.total,7080);assert.match(normal.respuesta,/7,080\.00/);assert.match(normal.respuesta,/150 cajas/);
  // Caso 2 y 3 comparten cotización y mismo contexto de la sesión PC3.
  m.reiniciar(true);
  await paso('Quiero preparar el caso PC3 del informe',/360 cajas.*340/i);
  await paso('Quiero recibir el pedido el 16 de noviembre de 2026',/40.*20/i);
  const entrega=await paso('Acepto la entrega',/pagar|credito|contado/i);
  assert.equal(entrega.cotizacion.entrega_aceptada,true);
  await paso('Quiero 8 % de descuento',/Jefatura/i);
  assert.equal(m.q.aprobaciones[0].estado,'PENDIENTE_JEFATURA');
  await llamar(gestion,{rol:'jefatura',id_solicitud:'DESC-1',decision:'APROBAR',porcentaje:8});
  const estado=await paso('¿Cómo va mi cotización?',/Jefatura.*8/i);
  assert.equal(estado.cotizacion.total,25629.6);assert.match(estado.respuesta,/25,629\.60/);
  await paso('Acepto',/descuento/i);
  const pagado=await paso('Con mi crédito aprobado',/crédito/i);assert.equal(pagado.cotizacion.forma_pago,'CREDITO');
  await paso('Confirmo la dirección',/Confirmas el pedido/i);
  const final=await paso('Confirmar pedido',/CONFIRMADA/);
  assert.equal(final.cotizacion.total,23579.23);assert.equal(m.asignaciones.length,1);assert.equal(m.asignaciones[0].cajas,20);
  assert.match(final.respuesta,/340 cajas/);assert.match(final.respuesta,/23,579\.23/);assert.match(final.respuesta,/condicional/i);
 }finally{hook.deregister();globalThis.Date=DateReal;delete globalThis.__casosChat;if(key===undefined)delete process.env.GROQ_API_KEY;else process.env.GROQ_API_KEY=key;}
});
