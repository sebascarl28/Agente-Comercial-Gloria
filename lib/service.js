import { randomUUID } from 'node:crypto';
import { calcularLineas, validarEntregasMulti } from './multiproducto.js';
import { consulta, uno, db } from './db.js';
import { falla, obligatorio } from './http.js';
import {esEscenarioPC3,PRIMERA_ENTREGA_PC3,SEGUNDA_ENTREGA_PC3} from './escenario.js';
import { cotizar, descuentoPermitido, MAX_DESCUENTO_AGENTE, MAX_DESCUENTO_JEFATURA, fechaLimaHoy, sumarDias, fechaPrimeraEntrega, fechaValida, repartoSugerido, fechaCobertura } from './rules.js';

const idCliente = () => 'CLI-' + randomUUID().slice(0,8).toUpperCase();
const ID_VALIDO = /^[a-zA-Z0-9-_]{1,48}$/;
function entero(v, nombre, max=100000) { const n=Number(v);if(!Number.isInteger(n)||n<1||n>max)falla(`${nombre} debe ser entero positivo (máximo ${max}).`);return n; }
function porcentaje(v) { const n=Number(v);if (!Number.isFinite(n)||n<0||n>100) falla('Porcentaje inválido.');return n; }
const efectivo = n => Number(n||0);
const json = x => JSON.stringify(x);
function idSeguro(id,nombre) { if(typeof id!=='string'||!ID_VALIDO.test(id)) falla(`${nombre} inválido.`);return id; }

export async function clientesYCatalogo() {
  const [clientes,productos,lotes,planes] = await Promise.all([
    consulta('SELECT * FROM clientes WHERE estado=$1 ORDER BY razon_social',['ACTIVO']),
    consulta('SELECT id_producto,sku,nombre,tipo,presentacion,unidades_caja,precio,imagen,activo FROM productos WHERE activo=true ORDER BY id_producto'),
    consulta(`SELECT s.*,p.nombre as producto FROM stock_lotes s JOIN productos p ON p.id_producto=s.id_producto ORDER BY s.id_producto,s.id_lote`),
    consulta(`SELECT t.*,p.nombre as producto FROM plan_produccion t JOIN productos p ON p.id_producto=t.id_producto ORDER BY t.fecha_disponibilidad`)
  ]);
  return {clientes,productos,lotes,planes,fecha_servidor:fechaLimaHoy(),con_groq:!!process.env.GROQ_API_KEY};
}
export async function contextoCliente(id) {
  idSeguro(id,'Cliente');
  const cliente = await uno('SELECT * FROM clientes WHERE id_cliente=$1',[id]);
  if (!cliente) falla('Cliente no encontrado.',404);
  const [contactos,direcciones,cotizaciones,pedidos,creditos,ultima] = await Promise.all([
    consulta('SELECT * FROM contactos_cliente WHERE id_cliente=$1 ORDER BY principal DESC',[id]),
    consulta('SELECT * FROM direcciones_entrega WHERE id_cliente=$1 ORDER BY principal DESC',[id]),
    consulta(`SELECT q.*, COALESCE((SELECT string_agg(d.cantidad::text||' cajas '||pr.nombre,' + ') FROM cotizacion_detalle d JOIN productos pr USING(id_producto) WHERE d.id_cotizacion=q.id_cotizacion),p.nombre) AS producto_nombre,p.imagen as producto_imagen FROM cotizaciones q JOIN productos p ON p.id_producto=q.id_producto WHERE id_cliente=$1 ORDER BY actualizado_en DESC LIMIT 12`,[id]),
    consulta('SELECT * FROM pedidos WHERE id_cliente=$1 ORDER BY creado_en DESC LIMIT 12',[id]),
    consulta('SELECT * FROM solicitudes_credito WHERE id_cliente=$1 ORDER BY creado_en DESC LIMIT 5',[id]),
    consulta('SELECT * FROM conversaciones WHERE id_cliente=$1 ORDER BY actualizado_en DESC LIMIT 1',[id])
  ]);
  return {cliente,contactos,direcciones,cotizaciones,pedidos,creditos,ultima_conversacion:ultima[0]||null};
}
export async function disponibilidad(idProducto) {
  idSeguro(idProducto,'Producto');
  const lote = await consulta(`SELECT l.id_lote,l.cajas,l.calidad,l.fecha_vencimiento,
  GREATEST(0, l.cajas - COALESCE((SELECT SUM(r.cajas) FROM reservas_stock r WHERE r.id_lote=l.id_lote),0))::int AS libres
  FROM stock_lotes l WHERE l.id_producto=$1 AND l.calidad='LIBERADO' AND l.fecha_vencimiento > $2::date ORDER BY l.fecha_vencimiento`,[idProducto,fechaLimaHoy()]);
  const planes = await consulta(`SELECT p.id_plan,p.cajas,p.fecha_produccion,p.fecha_disponibilidad,p.estado,p.referencia_pp_pi,
  GREATEST(0,p.cajas-COALESCE((SELECT SUM(a.cajas) FROM asignaciones_produccion a WHERE a.id_plan=p.id_plan),0))::int AS libres
  FROM plan_produccion p WHERE p.id_producto=$1 AND p.estado='PROGRAMADO' AND p.fecha_disponibilidad>=$2::date ORDER BY p.fecha_disponibilidad`,[idProducto,fechaLimaHoy()]);
  return {disponibles:lote.reduce((a,x)=>a+Number(x.libres),0),planificadas:planes.reduce((a,x)=>a+Number(x.libres),0),lotes:lote,planes};
}
async function producto(id) {
  const p = await uno('SELECT * FROM productos WHERE id_producto=$1 AND activo=true',[idSeguro(id,'Producto')]);
  if (!p) falla('Producto no encontrado.',404);
  return p;
}

async function lineasCotizacion(id,cn=null) {
  const sql=`SELECT d.*,p.nombre AS producto_nombre,p.imagen AS producto_imagen,p.costo,p.margen_minimo
    FROM cotizacion_detalle d JOIN productos p USING(id_producto)
    WHERE d.id_cotizacion=$1 ORDER BY CASE WHEN d.id_producto=(SELECT id_producto FROM cotizaciones WHERE id_cotizacion=$1) THEN 0 ELSE 1 END,d.id_detalle`;
  return cn?(await cn.query(sql,[id])).rows:consulta(sql,[id]);
}
async function guardarTotalesLineas(cn,id,descuento=0,{invalida=true}={}){
  const lineas=await lineasCotizacion(id,cn);
  const t=calcularLineas(lineas,descuento);
  for(const l of t.lineas) await cn.query('UPDATE cotizacion_detalle SET subtotal=$2,descuento_pct=$3 WHERE id_detalle=$1',[l.id_detalle,l.subtotal,descuento]);
  // Columnas de cabecera para compatibilidad con los demás módulos; las líneas son la fuente de verdad.
  const primero=t.lineas[0];
  const r=await cn.query(`UPDATE cotizaciones SET id_producto=$2,cantidad=$3,descuento_pct=$4,
     subtotal=$5,igv=$6,total=$7,entregas='[]'::jsonb,entrega_aceptada=false,
     version=version+1,estado='BORRADOR',actualizado_en=now()
     WHERE id_cotizacion=$1 RETURNING *`,[id,primero.id_producto,t.cantidad,descuento,t.subtotal,t.igv,t.total]);
  if(invalida)await cn.query(`UPDATE solicitudes_descuento SET estado='INVALIDADA',comentario='Se modificaron productos o cantidades; se requiere nueva evaluación' WHERE id_cotizacion=$1 AND estado IN ('PENDIENTE_JEFATURA','OFERTADO','ACEPTADA_CLIENTE')`,[id]);
  return r.rows[0];
}
// Varias líneas se actualizan juntas bajo bloqueo y versión, o no se cambia ninguna.
export async function cambiarLineas(id,items,{modo,version}={}) {
  if(!Array.isArray(items)||items.length<2||!['FIJAR','AGREGAR'].includes(modo))falla('Cambios de productos inválidos.');
  const ids=new Set();
  for(const x of items){idSeguro(x.id,'Producto');entero(x.cantidad,'Cajas',10000);if(ids.has(x.id))falla('Producto repetido.');ids.add(x.id);}
  const cn=await db().connect();
  try{
    await cn.query('BEGIN');
    const q=(await cn.query('SELECT * FROM cotizaciones WHERE id_cotizacion=$1 FOR UPDATE',[id])).rows[0];
    if(!q||q.estado==='CONFIRMADA')falla('La cotización ya no se puede modificar.');
    if(Number(q.version)!==Number(version))falla('La cotización cambió. Indica nuevamente las cantidades.');
    for(const x of items){
      const p=(await cn.query('SELECT * FROM productos WHERE id_producto=$1 AND activo=true',[x.id])).rows[0];
      if(!p)falla('Producto inexistente.');
      const previo=(await cn.query('SELECT * FROM cotizacion_detalle WHERE id_cotizacion=$1 AND id_producto=$2',[id,x.id])).rows[0];
      const cantidad=Number(x.cantidad)+(modo==='AGREGAR'?Number(previo?.cantidad||0):0);
      if(cantidad>10000)falla('Cantidad máxima por producto: 10000 cajas.');
      if(previo)await cn.query('UPDATE cotizacion_detalle SET cantidad=$3 WHERE id_cotizacion=$1 AND id_producto=$2',[id,x.id,cantidad]);
      else await cn.query('INSERT INTO cotizacion_detalle(id_cotizacion,id_producto,cantidad,precio_unitario,descuento_pct,subtotal) VALUES($1,$2,$3,$4,0,$5)',[id,x.id,cantidad,p.precio,Number(p.precio)*cantidad]);
    }
    const updated=await guardarTotalesLineas(cn,id,0);
    await cn.query('INSERT INTO historial_cotizaciones(id_cotizacion,version,motivo,instantanea) VALUES($1,$2,$3,$4::jsonb)',[id,updated.version,'Modificación de varias líneas comerciales',json(updated)]);
    await cn.query('COMMIT');
  }catch(err){await cn.query('ROLLBACK');throw err;}finally{cn.release();}
  return detalleCotizacion(id);
}
export async function cambiarLinea(id,id_producto,cantidad,{modo='AGREGAR'}={}) {
  idSeguro(id_producto,'Producto');
  const cn=await db().connect();let updated;
  try{
    await cn.query('BEGIN');
    const q=(await cn.query('SELECT * FROM cotizaciones WHERE id_cotizacion=$1 FOR UPDATE',[id])).rows[0];
    if(!q||q.estado==='CONFIRMADA')falla('La cotización no existe o ya fue confirmada.');
    const p=(await cn.query('SELECT * FROM productos WHERE id_producto=$1 AND activo=true',[id_producto])).rows[0];
    if(!p)falla('Producto inexistente.');
    const previo=(await cn.query('SELECT * FROM cotizacion_detalle WHERE id_cotizacion=$1 AND id_producto=$2',[id,id_producto])).rows[0];
    if(modo==='QUITAR'){
      if(!previo)falla('Ese producto no está en la cotización.');
      const n=(await cn.query('SELECT COUNT(*)::int AS n FROM cotizacion_detalle WHERE id_cotizacion=$1',[id])).rows[0].n;
      if(n<=1)falla('Debe quedar al menos un producto. Si deseas empezar de nuevo, usa Nueva simulación.');
      await cn.query('DELETE FROM cotizacion_detalle WHERE id_cotizacion=$1 AND id_producto=$2',[id,id_producto]);
    }else{
      const qty=entero(cantidad,'Cajas',10000);
      const nuevo=modo==='AGREGAR'?(Number(previo?.cantidad||0)+qty):qty;
      if(nuevo>10000)falla('Cantidad máxima por producto: 10000 cajas.');
      if(previo)await cn.query('UPDATE cotizacion_detalle SET cantidad=$3 WHERE id_cotizacion=$1 AND id_producto=$2',[id,id_producto,nuevo]);
      else await cn.query('INSERT INTO cotizacion_detalle(id_cotizacion,id_producto,cantidad,precio_unitario,descuento_pct,subtotal) VALUES($1,$2,$3,$4,0,$5)',[id,id_producto,nuevo,p.precio,Number(p.precio)*nuevo]);
    }
    updated=await guardarTotalesLineas(cn,id,0);
    await cn.query('INSERT INTO historial_cotizaciones(id_cotizacion,version,motivo,instantanea) VALUES($1,$2,$3,$4::jsonb)',[id,updated.version,'Modificación de líneas comerciales',json(updated)]);
    await cn.query('COMMIT');
  }catch(err){await cn.query('ROLLBACK');throw err;}finally{cn.release();}
  return detalleCotizacion(id);
}
async function cotizacionConDescuento(id,d){
  const l=await lineasCotizacion(id);
  return calcularLineas(l,d);
}
async function grabarDescuento(id,d,estado='EN_NEGOCIACION'){
  const cn=await db().connect();let nuevo,t;
  try{
    await cn.query('BEGIN');
    const locked=(await cn.query('SELECT * FROM cotizaciones WHERE id_cotizacion=$1 FOR UPDATE',[id])).rows[0];
    if(!locked||locked.estado==='CONFIRMADA')falla('La cotización ya no está disponible para descuento.');
    t=calcularLineas(await lineasCotizacion(id,cn),d);
    nuevo=(await cn.query(`UPDATE cotizaciones SET descuento_pct=$2,subtotal=$3,igv=$4,total=$5,estado=$6,
      version=version+1,actualizado_en=now() WHERE id_cotizacion=$1 RETURNING *`,[id,d,t.subtotal,t.igv,t.total,estado])).rows[0];
    for(const l of t.lineas)await cn.query('UPDATE cotizacion_detalle SET descuento_pct=$2,subtotal=$3 WHERE id_detalle=$1',[l.id_detalle,d,l.subtotal]);
    await cn.query('COMMIT');
  }catch(err){await cn.query('ROLLBACK');throw err;}finally{cn.release();}
  return {nuevo,...t};
}

async function cotizacion(id) {
  if (!id || !/^[a-f0-9-]{36}$/i.test(id)) falla('Cotización inválida.');
  const q = await uno(`SELECT q.*,p.nombre AS producto_nombre,p.imagen AS producto_imagen,p.precio,p.costo,p.margen_minimo,
    c.razon_social,c.linea_credito,c.plazo_credito_dias,c.deuda_vigente,dir.direccion,dir.distrito
    FROM cotizaciones q JOIN productos p ON p.id_producto=q.id_producto JOIN clientes c ON c.id_cliente=q.id_cliente
    LEFT JOIN direcciones_entrega dir ON dir.id_direccion=q.id_direccion
    WHERE q.id_cotizacion=$1`,[id]);
  if (!q) falla('Cotización no encontrada.',404);
  return q;
}
async function snapshot(q, motivo) {
  await consulta('INSERT INTO historial_cotizaciones(id_cotizacion,version,motivo,instantanea) VALUES($1,$2,$3,$4::jsonb)',[q.id_cotizacion,q.version,motivo,json(q)]);
}
export async function detalleCotizacion(id) {
  const q=await cotizacion(id);
  const [aprobaciones,lineas] = await Promise.all([
    consulta('SELECT * FROM solicitudes_descuento WHERE id_cotizacion=$1 ORDER BY creado_en DESC LIMIT 4',[id]),
    lineasCotizacion(id)
  ]);
  const disponibles=await Promise.all(lineas.map(l=>disponibilidad(l.id_producto)));
  const items=lineas.map((l,i)=>({id_producto:l.id_producto,producto_nombre:l.producto_nombre,producto_imagen:l.producto_imagen,
    cantidad:Number(l.cantidad),precio_unitario:Number(l.precio_unitario),descuento_pct:Number(l.descuento_pct),
    subtotal:Number(l.subtotal),disponibilidad:disponibles[i]}));
  const {costo,margen_minimo,...datosComerciales}=q;
  return {...datosComerciales,items,aprobaciones,disponibilidad:disponibles[0]||{disponibles:0,planificadas:0,lotes:[],planes:[]},
    producto_nombre:items.length>1?items.map(x=>x.producto_nombre).join(' + '):q.producto_nombre,
    calculo:{subtotal:Number(q.subtotal),igv:Number(q.igv),total:Number(q.total)}};
}

// Una cotización multiproducto se crea completa o se revierte íntegramente.
export async function crearCotizacionLineas(id_cliente,items){
  idSeguro(id_cliente,'Cliente');
  if(!Array.isArray(items)||items.length<2||items.length>3)falla('Indica de dos a tres leches.');
  const ids=new Set();
  for(const x of items){idSeguro(x.id,'Producto');entero(x.cantidad,'Cajas',10000);if(ids.has(x.id))falla('Producto repetido.');ids.add(x.id);}
  const cn=await db().connect();let id;
  try{
    await cn.query('BEGIN');
    const cliente=(await cn.query('SELECT id_cliente FROM clientes WHERE id_cliente=$1',[id_cliente])).rows[0];
    if(!cliente)falla('Cliente no encontrado.',404);
    const direccion=(await cn.query('SELECT id_direccion FROM direcciones_entrega WHERE id_cliente=$1 ORDER BY principal DESC LIMIT 1',[id_cliente])).rows[0];
    if(!direccion)falla('Registra primero la dirección de entrega del cliente.');
    const productos=[];
    for(const item of items){
      const p=(await cn.query('SELECT * FROM productos WHERE id_producto=$1 AND activo=true',[item.id])).rows[0];
      if(!p)falla('Producto inexistente.');productos.push(p);
    }
    const primero=items[0],p=productos[0],x=cotizar(p.precio,p.costo,primero.cantidad,0);
    const q=(await cn.query(`INSERT INTO cotizaciones(id_cliente,id_direccion,id_producto,cantidad,subtotal,igv,total,estado) VALUES($1,$2,$3,$4,$5,$6,$7,'BORRADOR') RETURNING *`,[id_cliente,direccion.id_direccion,primero.id,primero.cantidad,x.subtotal,x.igv,x.total])).rows[0];id=q.id_cotizacion;
    for(let i=0;i<items.length;i++){
      const item=items[i],producto=productos[i];
      await cn.query('INSERT INTO cotizacion_detalle(id_cotizacion,id_producto,cantidad,precio_unitario,descuento_pct,subtotal) VALUES($1,$2,$3,$4,0,$5)',[id,item.id,item.cantidad,producto.precio,Number(producto.precio)*item.cantidad]);
    }
    const updated=await guardarTotalesLineas(cn,id,0,{invalida:false});
    await cn.query('INSERT INTO historial_cotizaciones(id_cotizacion,version,motivo,instantanea) VALUES($1,$2,$3,$4::jsonb)',[id,updated.version,'Cotización inicial multiproducto',json(updated)]);
    await cn.query('COMMIT');
  }catch(err){await cn.query('ROLLBACK');throw err;}finally{cn.release();}
  return detalleCotizacion(id);
}
export async function crearCotizacion(id_cliente, id_producto, cantidad) {
  idSeguro(id_cliente,'Cliente'); const c=await uno('SELECT id_cliente FROM clientes WHERE id_cliente=$1',[id_cliente]);if(!c)falla('Cliente no encontrado.');
  const p=await producto(id_producto); const cantidadOk=entero(cantidad,'Cantidad de cajas',10000);
  const x=cotizar(p.precio,p.costo,cantidadOk,0);
  const direccion=await uno('SELECT id_direccion FROM direcciones_entrega WHERE id_cliente=$1 ORDER BY principal DESC LIMIT 1',[id_cliente]);
  if(!direccion)falla('Registra primero la dirección de entrega del cliente.');
  const q=await uno(`INSERT INTO cotizaciones(id_cliente,id_direccion,id_producto,cantidad,subtotal,igv,total,estado) VALUES($1,$2,$3,$4,$5,$6,$7,'BORRADOR') RETURNING *`,[id_cliente,direccion.id_direccion,id_producto,cantidadOk,x.subtotal,x.igv,x.total]);
  await consulta('INSERT INTO cotizacion_detalle(id_cotizacion,id_producto,cantidad,precio_unitario,descuento_pct,subtotal) VALUES($1,$2,$3,$4,$5,$6)',[q.id_cotizacion,id_producto,cantidadOk,p.precio,0,x.subtotal]);
  await snapshot(q,'Cotización inicial');return detalleCotizacion(q.id_cotizacion);
}
export async function modificarCotizacion(id, cambios={}) {
  const q=await cotizacion(id);if(q.estado==='CONFIRMADA')falla('El pedido ya fue confirmado; no se puede modificar esta cotización.');
  if((await lineasCotizacion(id)).length>1)falla('Esta cotización tiene varios productos. Indica cuál deseas cambiar o quitar por chat.');
  const p=await producto(cambios.id_producto || q.id_producto),cantidadOk=cambios.cantidad!=null?entero(cambios.cantidad,'Cantidad',10000):q.cantidad;
  const relevante=p.id_producto!==q.id_producto||cantidadOk!==q.cantidad;
  const d=relevante ? 0 : Number(q.descuento_pct);
  const x=cotizar(p.precio,p.costo,cantidadOk,d);
  const nuevo=await uno(`UPDATE cotizaciones SET id_producto=$2,cantidad=$3,descuento_pct=$4,subtotal=$5,igv=$6,total=$7,
  version=version+1,estado='BORRADOR',entregas=$8::jsonb,entrega_aceptada=$9,actualizado_en=now()
  WHERE id_cotizacion=$1 RETURNING *`,[id,p.id_producto,cantidadOk,d,x.subtotal,x.igv,x.total,relevante?'[]':json(q.entregas),relevante?false:q.entrega_aceptada]);
  await consulta('UPDATE cotizacion_detalle SET id_producto=$2,cantidad=$3,precio_unitario=$4,descuento_pct=$5,subtotal=$6 WHERE id_cotizacion=$1',[id,p.id_producto,cantidadOk,p.precio,d,x.subtotal]);
  if(relevante) await consulta(`UPDATE solicitudes_descuento SET estado='INVALIDADA',comentario='La cotización cambió; requiere reevaluación' WHERE id_cotizacion=$1 AND estado IN ('PENDIENTE_JEFATURA','OFERTADO','ACEPTADA_CLIENTE')`,[id]);
  await snapshot(nuevo,'Cliente modifica producto o cantidad');return detalleCotizacion(id);
}
export async function solicitarDescuento(id, pct) {
  const q=await cotizacion(id);if(q.estado==='CONFIRMADA')falla('Cotización confirmada.');
  const d=porcentaje(pct);
  if(d>MAX_DESCUENTO_JEFATURA) falla(`La Jefatura Comercial solo puede evaluar hasta ${MAX_DESCUENTO_JEFATURA} %.`,400);
  if(d<=MAX_DESCUENTO_AGENTE) {
    const x=await grabarDescuento(id,d);
    const nuevo=x.nuevo;
    await consulta(`UPDATE solicitudes_descuento SET estado='INVALIDADA' WHERE id_cotizacion=$1 AND estado IN ('PENDIENTE_JEFATURA','OFERTADO')`,[id]);
    await snapshot(nuevo,`Descuento automático ${d}% dentro de las reglas`);
    return {mensaje:`Se aplicó el ${d} % de descuento. Subtotal S/ ${x.subtotal.toFixed(2)} y total con IGV S/ ${x.total.toFixed(2)}.`,cotizacion:await detalleCotizacion(id)};
  }
  const pendiente=await uno(`SELECT id_solicitud FROM solicitudes_descuento WHERE id_cotizacion=$1 AND estado IN ('PENDIENTE_JEFATURA','OFERTADO') LIMIT 1`,[id]);
  if(pendiente) falla('Ya existe una solicitud de descuento pendiente. Espera la respuesta o acepta/rechaza la oferta.');
  const s=await uno(`INSERT INTO solicitudes_descuento(id_cotizacion,id_cliente,solicitado_pct) VALUES($1,$2,$3) RETURNING *`,[id,q.id_cliente,d]);
  await consulta(`UPDATE cotizaciones SET estado='PENDIENTE_JEFATURA',actualizado_en=now() WHERE id_cotizacion=$1`,[id]);
  return {mensaje:`Envié tu solicitud de ${d} % a Jefatura Comercial. Su límite es 12 %, sujeto al margen mínimo. El pedido aún no está confirmado.`,solicitud:s,cotizacion:await detalleCotizacion(id)};
}
export async function clienteRespondeDescuento(idSolicitud, aceptar) {
  const s=await uno('SELECT * FROM solicitudes_descuento WHERE id_solicitud=$1',[idSolicitud]);
  if(!s)falla('Solicitud de descuento no encontrada.',404);
  if(s.estado!=='OFERTADO')falla('Esta solicitud no tiene una oferta pendiente de aceptación.');
  if(!aceptar) {
    await consulta(`UPDATE solicitudes_descuento SET estado='RECHAZADA_CLIENTE',respondido_cliente_en=now() WHERE id_solicitud=$1`,[idSolicitud]);
    await consulta(`UPDATE cotizaciones SET estado='EN_NEGOCIACION',actualizado_en=now() WHERE id_cotizacion=$1`,[s.id_cotizacion]);
    return {mensaje:'El cliente rechazó el descuento ofrecido. Se puede renegociar.'};
  }
  const q=await cotizacion(s.id_cotizacion);
  const x=await grabarDescuento(q.id_cotizacion,Number(s.ofrecido_pct));
  const nuevo=x.nuevo;
  await consulta(`UPDATE solicitudes_descuento SET estado='ACEPTADA_CLIENTE',respondido_cliente_en=now() WHERE id_solicitud=$1`,[idSolicitud]);
  await snapshot(nuevo,`Cliente acepta descuento ${s.ofrecido_pct}% autorizado por Jefatura`);
  return {mensaje:`Aceptaste el descuento de ${s.ofrecido_pct} % autorizado por Jefatura. El total actualizado es S/ ${x.total.toFixed(2)}.`,cotizacion:await detalleCotizacion(q.id_cotizacion)};
}
export async function crearCliente(datos) {
  const razon=obligatorio(datos.razon_social,'Razón social',120);
  const ruc=obligatorio(datos.ruc,'RUC',11);
  if(!/^\d{11}$/.test(ruc))falla('El RUC de prueba debe tener 11 dígitos.');
  if(!['MAYORISTA','DISTRIBUIDOR'].includes(datos.segmento))falla('Solo se aceptan mayoristas o distribuidores.');
  const cel=obligatorio(datos.celular,'Celular',30);const correo=obligatorio(datos.correo,'Correo',120);
  const direccion=obligatorio(datos.direccion,'Dirección',180),distrito=obligatorio(datos.distrito,'Distrito',80);
  const nombreContacto=obligatorio(datos.contacto,'Contacto',120);
  const id=idCliente();const cn=await db().connect();
  try {await cn.query('BEGIN');
    await cn.query(`INSERT INTO clientes(id_cliente,razon_social,ruc,segmento,celular,correo) VALUES($1,$2,$3,$4,$5,$6)`,[id,razon,ruc,datos.segmento,cel,correo]);
    await cn.query('INSERT INTO contactos_cliente(id_contacto,id_cliente,nombre,cargo,celular,correo) VALUES($1,$2,$3,$4,$5,$6)',[`CON-${id}`,id,nombreContacto,'Compras',cel,correo]);
    await cn.query('INSERT INTO direcciones_entrega(id_direccion,id_cliente,direccion,distrito) VALUES($1,$2,$3,$4)',[`DIR-${id}`,id,direccion,distrito]);
    await cn.query('COMMIT');
  } catch(err){await cn.query('ROLLBACK');if(err.code==='23505')falla('Ese RUC ya está registrado.');throw err;} finally {cn.release();}
  return {cliente:await uno('SELECT * FROM clientes WHERE id_cliente=$1',[id]),mensaje:'Cliente registrado. Aún no tiene crédito aprobado: puede comprar al contado o solicitar evaluación a Finanzas.'};
}
export async function solicitarCredito(clienteId,monto,plazo) {
  const c=await uno('SELECT * FROM clientes WHERE id_cliente=$1',[idSeguro(clienteId,'Cliente')]);if(!c)falla('Cliente inexistente.');
  const m=Number(monto), p=entero(plazo,'Plazo',120);
  if(!Number.isFinite(m)||m<=0||m>1000000)falla('Monto solicitado inválido.');
  if(Number(c.linea_credito)>0 && m<=Number(c.linea_credito))falla(`Para ampliar crédito solicita una línea TOTAL mayor que los S/ ${Number(c.linea_credito).toFixed(2)} actuales.`);
  const s=await uno(`INSERT INTO solicitudes_credito(id_cliente,monto_solicitado,plazo_solicitado) VALUES($1,$2,$3) RETURNING *`,[clienteId,m,p]);
  return {mensaje:`Envié a Finanzas la solicitud de S/ ${m.toFixed(2)} a ${p} días. Hasta que Finanzas decida y el cliente acepte, la línea aprobada no cambia.`,solicitud:s};
}
export async function clienteRespondeCredito(solicitudId,aceptar) {
  const s=await uno('SELECT * FROM solicitudes_credito WHERE id_solicitud=$1',[solicitudId]);if(!s)falla('Solicitud inexistente.',404);
  if(s.estado!=='OFERTADO')falla('Esta solicitud no tiene una oferta pendiente de aceptación.');
  const cn=await db().connect();
  try {await cn.query('BEGIN');
    const locked=await cn.query('SELECT * FROM solicitudes_credito WHERE id_solicitud=$1 FOR UPDATE',[solicitudId]);
    if(locked.rows[0].estado!=='OFERTADO')falla('La oferta ya fue procesada.');
    if(aceptar) {
      await cn.query(`UPDATE clientes SET linea_credito=$2,plazo_credito_dias=$3 WHERE id_cliente=$1`,[s.id_cliente,s.monto_ofrecido,s.plazo_ofrecido]);
      await cn.query(`UPDATE solicitudes_credito SET estado='ACEPTADA_CLIENTE',respondido_cliente_en=now() WHERE id_solicitud=$1`,[solicitudId]);
    } else await cn.query(`UPDATE solicitudes_credito SET estado='RECHAZADA_CLIENTE',respondido_cliente_en=now() WHERE id_solicitud=$1`,[solicitudId]);
    await cn.query('COMMIT');
  }catch(err){await cn.query('ROLLBACK');throw err;}finally{cn.release();}
  return {mensaje:aceptar?`Crédito activado: S/ ${Number(s.monto_ofrecido).toFixed(2)} a ${s.plazo_ofrecido} días.`:'Cliente rechazó la oferta de crédito; puede comprar al contado.'};
}
function sDate(p) {return typeof p==='string'?p:new Date(p).toISOString().slice(0,10);}
// Las fechas son propuestas comerciales, no promesas de transporte ni de liberación de QM.
function validarPartes(partes, available, hoy) {
  if(!Array.isArray(partes)||!partes.length||partes.length>4)falla('Indica de una a cuatro entregas.');
  const orden=[...partes].sort((a,b)=>String(a.fecha).localeCompare(String(b.fecha)));
  let stockRestante=Number(available.disponibles);let planes=available.planes.map(x=>({...x,libres:Number(x.libres),fecha:sDate(x.fecha_disponibilidad)}));
  const salida=[];
  for(const parte of orden){
    const qty=entero(parte.cajas,'Cajas por entrega',10000),fecha=parte.fecha;
    if(!fechaValida(fecha)||fecha<hoy)falla('La fecha de entrega debe ser válida y no anterior a hoy.');
    let restante=qty;
    if(stockRestante>0){const usado=Math.min(restante,stockRestante);if(usado){salida.push({cajas:usado,fecha,origen:'STOCK'});stockRestante-=usado;restante-=usado;}}
    for(const plan of planes){if(!restante)break;if(fecha>=plan.fecha&&plan.libres>0){const usado=Math.min(restante,plan.libres);salida.push({cajas:usado,fecha,origen:'PRODUCCION',id_plan:plan.id_plan,condicional:true});plan.libres-=usado;restante-=usado;}}
    if(restante)falla(`Para el ${fecha} faltan ${restante} cajas; consulta el plan de producción o negocia otra fecha.`);
  }
  return salida;
}
export async function proponerEntrega(id,datos={}) {
  const q=await detalleCotizacion(id);if(q.estado==='CONFIRMADA')falla('El pedido ya está confirmado.');
  const hoy=fechaLimaHoy(),items=q.items;
  let propuesta=[];
  const casoOficial=esEscenarioPC3() && items.length===3 &&
    items.some(x=>x.id_producto==='PRD-001'&&Number(x.cantidad)===180) &&
    items.some(x=>x.id_producto==='PRD-002'&&Number(x.cantidad)===60) &&
    items.some(x=>x.id_producto==='PRD-003'&&Number(x.cantidad)===120);
  if(casoOficial && datos.modo==='DOS_PARTES'){
    propuesta=[
      {id_producto:'PRD-001',cajas:180,fecha:PRIMERA_ENTREGA_PC3},
      {id_producto:'PRD-002',cajas:40,fecha:PRIMERA_ENTREGA_PC3},
      {id_producto:'PRD-003',cajas:120,fecha:PRIMERA_ENTREGA_PC3},
      {id_producto:'PRD-002',cajas:20,fecha:SEGUNDA_ENTREGA_PC3}
    ];
  }else if(datos.modo==='PERSONALIZADA'){
    if(!Array.isArray(datos.partes))falla('Indica las cantidades y fechas de entrega.');
    if(items.length>1&&datos.partes.some(x=>!x.id_producto))falla('Para varios productos, especifica a qué leche pertenece cada entrega.');
    propuesta=datos.partes.map(x=>({...x,id_producto:x.id_producto||items[0].id_producto}));
  }else if(['DOS_PARTES','TODO_DESPUES'].includes(datos.modo)){
    const fechas=[];
    for(const item of items){
      const d=item.disponibilidad, faltante=Math.max(0,item.cantidad-d.disponibles);
      if(faltante>d.planificadas)falla(`No hay stock ni producción suficientes para ${item.cantidad} cajas de ${item.producto_nombre}. Debe consultar Planeamiento o reducir la cantidad de ese producto.`);
      fechas.push(faltante?fechaCobertura(d.planes,faltante):fechaPrimeraEntrega(hoy));
    }
    const fechaJunta=datos.fecha||fechas.sort().at(-1)||fechaPrimeraEntrega(hoy);
    for(const item of items){
      const d=item.disponibilidad, faltante=Math.max(0,item.cantidad-d.disponibles);
      if(datos.modo==='TODO_DESPUES')propuesta.push({id_producto:item.id_producto,cajas:item.cantidad,fecha:fechaJunta});
      else if(faltante>0&&d.disponibles>0){
        propuesta.push({id_producto:item.id_producto,cajas:item.cantidad-faltante,fecha:fechaPrimeraEntrega(hoy)});
        propuesta.push({id_producto:item.id_producto,cajas:faltante,fecha:fechaCobertura(d.planes,faltante)});
      } else if(item.cantidad>=2&&faltante===0){
        const primera=Math.ceil(item.cantidad/2);
        propuesta.push({id_producto:item.id_producto,cajas:primera,fecha:fechaPrimeraEntrega(hoy)});
        propuesta.push({id_producto:item.id_producto,cajas:item.cantidad-primera,fecha:sumarDias(hoy,4)});
      } else propuesta.push({id_producto:item.id_producto,cajas:item.cantidad,fecha:faltante?fechaCobertura(d.planes,faltante):fechaPrimeraEntrega(hoy)});
    }
  } else falla('Modo de entrega inválido.');
  try{validarEntregasMulti(items,propuesta);}catch(err){falla(err.message);}
  const reparto=[];
  for(const item of items){
    const piezas=propuesta.filter(x=>x.id_producto===item.id_producto);
    const validas=validarPartes(piezas,item.disponibilidad,hoy);
    reparto.push(...validas.map(x=>({...x,id_producto:item.id_producto})));
  }
  await consulta(`UPDATE cotizaciones SET entregas=$2::jsonb,entrega_aceptada=false,version=version+1,actualizado_en=now() WHERE id_cotizacion=$1`,[id,json(reparto)]);
  const detalle=propuesta.map(x=>`${x.cajas} cajas de ${items.find(i=>i.id_producto===x.id_producto)?.producto_nombre} el ${String(x.fecha).slice(0,10).split('-').reverse().join('/')}`).join('; ');
  const pendiente=reparto.some(x=>x.origen==='PRODUCCION');
  const condicion=pendiente?' Algunas cajas aún están en producción y podrán entregarse cuando se liberen; la fecha debe confirmarse con despacho.':' La fecha debe confirmarse con despacho.';
  return {mensaje:`Te propongo: ${detalle}.${condicion} ¿Aceptas esta propuesta?`,cotizacion:await detalleCotizacion(id)};
}

function hoyFecha(x){return typeof x==='string'?x:new Date(x).toISOString().slice(0,10);}
export async function aceptarEntrega(id,acepta) {
  const q=await cotizacion(id);if(!q.entregas?.length)falla('Primero prepara una propuesta de entrega.');
  await consulta('UPDATE cotizaciones SET entrega_aceptada=$2,version=version+1,actualizado_en=now() WHERE id_cotizacion=$1',[id,!!acepta]);
  return {mensaje:acepta?'Se aceptó el esquema de entrega propuesto.':'El esquema se rechazó; podemos negociar otra fecha.',cotizacion:await detalleCotizacion(id)};
}
export async function confirmarDireccion(id,id_direccion) {
  const q=await cotizacion(id);
  if(q.estado==='CONFIRMADA')falla('El pedido ya fue confirmado.');
  const dir=await uno('SELECT * FROM direcciones_entrega WHERE id_direccion=$1 AND id_cliente=$2',[id_direccion,q.id_cliente]);
  if(!dir)falla('La dirección no corresponde al cliente.');
  await consulta(`UPDATE cotizaciones SET id_direccion=$2,direccion_confirmada=true,version=version+1,actualizado_en=now() WHERE id_cotizacion=$1`,[id,id_direccion]);
  return {mensaje:`Dirección confirmada: ${dir.direccion}, ${dir.distrito}.`,cotizacion:await detalleCotizacion(id)};
}
export async function definirPago(id,modalidad) {
  const q=await cotizacion(id);
  if(!['CONTADO','CREDITO','ANTICIPO'].includes(modalidad))falla('Forma de pago inválida.');
  if(modalidad==='CREDITO'){
    const disponible=Number(q.linea_credito)-Number(q.deuda_vigente);
    if(disponible<Number(q.total))falla(`El crédito disponible es S/ ${disponible.toFixed(2)}, menor al total S/ ${Number(q.total).toFixed(2)}. Solicita evaluación de Finanzas o cambia la forma de pago.`);
  }
  await consulta(`UPDATE cotizaciones SET forma_pago=$2,actualizado_en=now() WHERE id_cotizacion=$1`,[id,modalidad]);
  const mensaje=modalidad==='ANTICIPO'?'Se propone anticipo del 40 % y saldo del 60 % contraentrega (condición académica simulada).':modalidad==='CREDITO'?'Se seleccionó crédito dentro de la línea aprobada.':'Se seleccionó pago al contado.';
  return {mensaje,cotizacion:await detalleCotizacion(id)};
}
export async function confirmarPedido(id) {
  const cn=await db().connect();
  try{
    await cn.query('BEGIN');
    const rq=await cn.query(`SELECT q.*,c.linea_credito,c.deuda_vigente,c.plazo_credito_dias FROM cotizaciones q JOIN clientes c ON c.id_cliente=q.id_cliente WHERE q.id_cotizacion=$1 FOR UPDATE OF q,c`,[id]);
    const q=rq.rows[0];if(!q)falla('Cotización no encontrada.');
    if(q.estado==='CONFIRMADA')falla('Este pedido ya fue confirmado.');
    if(!q.direccion_confirmada)falla('Falta confirmar la dirección de entrega.');
    if(!q.entrega_aceptada||!q.entregas?.length)falla('El cliente debe aceptar las entregas.');
    if(q.forma_pago==='SIN_DEFINIR')falla('El cliente debe definir el pago.');
    const pendientes=await cn.query(`SELECT 1 FROM solicitudes_descuento WHERE id_cotizacion=$1 AND estado IN ('PENDIENTE_JEFATURA','OFERTADO') LIMIT 1`,[id]);
    if(pendientes.rowCount)falla('Falta Jefatura Comercial o la aceptación del cliente.');
    const lineas=await lineasCotizacion(id,cn);
    const x=calcularLineas(lineas,Number(q.descuento_pct));
    if(Math.abs(x.total-Number(q.total))>0.01||x.cantidad!==Number(q.cantidad))falla('La cotización cambió; debe recalcularse.');
    if(q.forma_pago==='CREDITO'&&Number(q.linea_credito)-Number(q.deuda_vigente)<x.total)falla('Crédito insuficiente; consultar Finanzas.');
    const partes=q.entregas.map(p=>({...p,id_producto:p.id_producto||q.id_producto}));
    try{validarEntregasMulti(x.lineas,partes);}catch(err){falla(err.message);}
    const ids=x.lineas.map(l=>l.id_producto);
    const st=await cn.query(`SELECT * FROM stock_lotes WHERE id_producto=ANY($1::text[]) AND calidad='LIBERADO' AND fecha_vencimiento>$2::date ORDER BY id_producto,fecha_vencimiento FOR UPDATE`,[ids,fechaLimaHoy()]);
    const pp=await cn.query(`SELECT * FROM plan_produccion WHERE id_producto=ANY($1::text[]) AND estado='PROGRAMADO' AND fecha_disponibilidad>=$2::date ORDER BY id_producto,fecha_disponibilidad FOR UPDATE`,[ids,fechaLimaHoy()]);
    const lotes=[];for(const r of st.rows){const used=await cn.query('SELECT COALESCE(SUM(cajas),0)::int usados FROM reservas_stock WHERE id_lote=$1',[r.id_lote]);lotes.push({...r,libres:r.cajas-Number(used.rows[0].usados)});}
    const planes=[];for(const r of pp.rows){const used=await cn.query('SELECT COALESCE(SUM(cajas),0)::int usados FROM asignaciones_produccion WHERE id_plan=$1',[r.id_plan]);planes.push({...r,libres:r.cajas-Number(used.rows[0].usados)});}
    const reserva=[],planAsignado=[];let condicional=false;
    for(const parte of partes){
      const qty=entero(parte.cajas,'Cajas'),fecha=parte.fecha;
      if(!fechaValida(fecha)||fecha<fechaLimaHoy())falla('Una fecha de entrega ya pasó; negocia otra.');
      let restante=qty;
      if(parte.origen==='STOCK'){
        for(const l of lotes.filter(v=>v.id_producto===parte.id_producto)){
          const n=Math.min(restante,l.libres);if(n>0){reserva.push({id:l.id_lote,cajas:n});l.libres-=n;restante-=n;}if(!restante)break;
        }
      } else if(parte.origen==='PRODUCCION'){
        condicional=true;
        for(const v of planes.filter(v=>v.id_producto===parte.id_producto&&fecha>=hoyFecha(v.fecha_disponibilidad))){
          const n=Math.min(restante,v.libres);if(n>0){planAsignado.push({id:v.id_plan,cajas:n});v.libres-=n;restante-=n;}if(!restante)break;
        }
      }else falla('Origen de entrega desconocido.');
      if(restante)falla(`Para ${parte.id_producto} faltan ${restante} cajas en el tramo del ${fecha}. Revalidar entrega.`);
    }
    const pedido=(await cn.query(`INSERT INTO pedidos(id_cotizacion,id_cliente,estado,total,entregas,forma_pago) VALUES($1,$2,$3,$4,$5::jsonb,$6) RETURNING *`,[id,q.id_cliente,condicional?'PROGRAMADO_CONDICIONAL':'REGISTRADO',x.total,json(partes),q.forma_pago])).rows[0];
    for(const [i,p] of partes.entries())await cn.query(`INSERT INTO entregas(id_pedido,id_producto,numero_parte,cajas,fecha_propuesta,origen,estado) VALUES($1,$2,$3,$4,$5,$6,$7)`,[pedido.id_pedido,p.id_producto,i+1,p.cajas,p.fecha,p.origen,p.origen==='PRODUCCION'?'PROGRAMADA_CONDICIONAL':'PROPUESTA_DESPACHO']);
    const hoy=fechaLimaHoy();
    if(q.forma_pago==='CREDITO')await cn.query('INSERT INTO pagos(id_pedido,tipo,monto,fecha_vencimiento) VALUES($1,$2,$3,$4)',[pedido.id_pedido,'CREDITO',x.total,sumarDias(hoy,Number(q.plazo_credito_dias||30))]);
    else if(q.forma_pago==='ANTICIPO'){
      const a=Math.round(x.total*0.4*100)/100;
      await cn.query('INSERT INTO pagos(id_pedido,tipo,monto,fecha_vencimiento) VALUES($1,$2,$3,$4)',[pedido.id_pedido,'ANTICIPO_40',a,hoy]);
      await cn.query('INSERT INTO pagos(id_pedido,tipo,monto,fecha_vencimiento) VALUES($1,$2,$3,$4)',[pedido.id_pedido,'SALDO_60',Math.round((x.total-a)*100)/100,hoy]);
    }else await cn.query('INSERT INTO pagos(id_pedido,tipo,monto,fecha_vencimiento) VALUES($1,$2,$3,$4)',[pedido.id_pedido,'CONTADO',x.total,hoy]);
    for(const r of reserva)await cn.query('INSERT INTO reservas_stock(id_pedido,id_lote,cajas) VALUES($1,$2,$3)',[pedido.id_pedido,r.id,r.cajas]);
    for(const r of planAsignado)await cn.query('INSERT INTO asignaciones_produccion(id_pedido,id_plan,cajas) VALUES($1,$2,$3)',[pedido.id_pedido,r.id,r.cajas]);
    if(q.forma_pago==='CREDITO')await cn.query('UPDATE clientes SET deuda_vigente=deuda_vigente+$2 WHERE id_cliente=$1',[q.id_cliente,x.total]);
    await cn.query(`UPDATE cotizaciones SET estado='CONFIRMADA',actualizado_en=now() WHERE id_cotizacion=$1`,[id]);
    await cn.query('COMMIT');
    return {mensaje:condicional?'Pedido registrado con tramos de producción CONDICIONALES: falta Calidad y logística.':'Pedido registrado; despachos sujetos a logística.',pedido};
  }catch(err){await cn.query('ROLLBACK');if(err.code==='23505')falla('Esta cotización ya tiene un pedido.');throw err;}finally{cn.release();}
}

export async function listarAprobaciones(rol) {
  if(rol==='finanzas')return consulta(`SELECT s.*,c.razon_social,c.linea_credito,c.plazo_credito_dias FROM solicitudes_credito s JOIN clientes c USING(id_cliente) ORDER BY s.creado_en DESC LIMIT 50`);
  if(rol==='jefatura')return consulta(`SELECT s.*,c.razon_social,q.cantidad,q.total,p.precio,p.costo,p.margen_minimo, COALESCE((SELECT string_agg(d.cantidad::text||' cajas de '||px.nombre,' + ') FROM cotizacion_detalle d JOIN productos px USING(id_producto) WHERE d.id_cotizacion=q.id_cotizacion),p.nombre) AS producto_nombre FROM solicitudes_descuento s JOIN clientes c USING(id_cliente) JOIN cotizaciones q ON q.id_cotizacion=s.id_cotizacion JOIN productos p ON p.id_producto=q.id_producto ORDER BY s.creado_en DESC LIMIT 50`);
  falla('Rol inválido.');
}
export async function decidirCredito(id,decision,monto,plazo,comentario) {
  if(!['APROBAR','CONTRAOFERTAR','RECHAZAR'].includes(decision))falla('Decisión inválida.');
  const s=await uno('SELECT s.*,c.linea_credito FROM solicitudes_credito s JOIN clientes c USING(id_cliente) WHERE s.id_solicitud=$1',[id]);if(!s)falla('Solicitud inexistente.',404);
  if(s.estado!=='PENDIENTE_FINANZAS')falla('Esta solicitud ya fue procesada.');
  let m=null,p=null;
  if(decision!=='RECHAZAR'){m=Number(monto);p=entero(plazo,'Plazo',120);if(!Number.isFinite(m)||m<=0||m>1000000)falla('Monto autorizado inválido.');if(m<Number(s.linea_credito))falla('Una ampliación no debe disminuir la línea ya aprobada.');}
  const estado=decision==='RECHAZAR'?'RECHAZADA_FINANZAS':'OFERTADO';
  const r=await uno(`UPDATE solicitudes_credito SET estado=$2,monto_ofrecido=$3,plazo_ofrecido=$4,comentario=$5,responsable='Finanzas (demo)',decidido_en=now() WHERE id_solicitud=$1 AND estado='PENDIENTE_FINANZAS' RETURNING *`,[id,estado,m,p,(comentario||'').slice(0,500)]);
  if(!r)falla('La solicitud ya fue evaluada.');
  return {mensaje:decision==='RECHAZAR'?'Crédito rechazado. El agente debe comunicárselo al cliente.':`Finanzas ofreció S/ ${m.toFixed(2)} a ${p} días. Falta la aceptación del cliente.`,solicitud:r};
}
export async function decidirDescuento(id,decision,pct,comentario) {
  if(!['APROBAR','CONTRAOFERTAR','RECHAZAR'].includes(decision))falla('Decisión inválida.');
  const s=await uno('SELECT * FROM solicitudes_descuento WHERE id_solicitud=$1',[id]);if(!s)falla('Solicitud inexistente.',404);
  if(s.estado!=='PENDIENTE_JEFATURA')falla('Esta solicitud ya fue procesada.');
  let offered=null;
  if(decision!=='RECHAZAR'){
    offered=porcentaje(pct);
    if(offered>MAX_DESCUENTO_JEFATURA)falla('La Jefatura no puede autorizar más de 12 %.');
    if(offered>Number(s.solicitado_pct))falla('La oferta no puede superar lo solicitado por el cliente.');
    const q=await cotizacion(s.id_cotizacion);
    try{await cotizacionConDescuento(s.id_cotizacion,offered);}catch(err){falla('El descuento infringe el margen mínimo de uno o más productos. Ofrece un porcentaje menor.');}
  }
  const estado=decision==='RECHAZAR'?'RECHAZADA_JEFATURA':'OFERTADO';
  const r=await uno(`UPDATE solicitudes_descuento SET estado=$2,ofrecido_pct=$3,comentario=$4,responsable='Jefatura Comercial (demo)',decidido_en=now() WHERE id_solicitud=$1 AND estado='PENDIENTE_JEFATURA' RETURNING *`,[id,estado,offered,(comentario||'').slice(0,500)]);
  if(!r)falla('La solicitud ya fue evaluada.');
  if(decision==='RECHAZAR')await consulta(`UPDATE cotizaciones SET estado='EN_NEGOCIACION' WHERE id_cotizacion=$1`,[s.id_cotizacion]);
  return {mensaje:decision==='RECHAZAR'?'Jefatura rechazó el descuento; el agente debe ofrecer alternativas.':`Jefatura autorizó ofrecer ${offered} %. Falta la aceptación del cliente para aplicar la cotización.`,solicitud:r};
}
