import { randomUUID } from 'node:crypto';
import { consulta, uno, db } from './db.js';
import { falla, obligatorio } from './http.js';
import { cotizar, descuentoPermitido, MAX_DESCUENTO_AGENTE, MAX_DESCUENTO_JEFATURA, fechaLimaHoy, sumarDias, fechaValida, repartoSugerido } from './rules.js';

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
    consulta(`SELECT q.*,p.nombre as producto_nombre,p.imagen as producto_imagen FROM cotizaciones q JOIN productos p ON p.id_producto=q.id_producto WHERE id_cliente=$1 ORDER BY actualizado_en DESC LIMIT 12`,[id]),
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
  FROM stock_lotes l WHERE l.id_producto=$1 AND l.calidad='LIBERADO' AND l.fecha_vencimiento > current_date ORDER BY l.fecha_vencimiento`,[idProducto]);
  const planes = await consulta(`SELECT p.id_plan,p.cajas,p.fecha_produccion,p.fecha_disponibilidad,p.estado,p.referencia_pp_pi,
  GREATEST(0,p.cajas-COALESCE((SELECT SUM(a.cajas) FROM asignaciones_produccion a WHERE a.id_plan=p.id_plan),0))::int AS libres
  FROM plan_produccion p WHERE p.id_producto=$1 AND p.estado='PROGRAMADO' AND p.fecha_disponibilidad>=current_date ORDER BY p.fecha_disponibilidad`,[idProducto]);
  return {disponibles:lote.reduce((a,x)=>a+Number(x.libres),0),planificadas:planes.reduce((a,x)=>a+Number(x.libres),0),lotes:lote,planes};
}
async function producto(id) {
  const p = await uno('SELECT * FROM productos WHERE id_producto=$1 AND activo=true',[idSeguro(id,'Producto')]);
  if (!p) falla('Producto no encontrado.',404);
  return p;
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
  const [aprobaciones,disponible] = await Promise.all([
    consulta('SELECT * FROM solicitudes_descuento WHERE id_cotizacion=$1 ORDER BY creado_en DESC LIMIT 4',[id]),
    disponibilidad(q.id_producto)
  ]);
  const {costo,margen_minimo,...datosComerciales}=q;
  const {margen_pct,...calculoPublico}=cotizar(q.precio,q.costo,q.cantidad,q.descuento_pct);
  return {...datosComerciales,aprobaciones,disponibilidad:disponible,calculo:calculoPublico};
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
    if(!descuentoPermitido(q.precio,q.costo,q.margen_minimo,d)) falla('Ese descuento no cumple el margen mínimo del producto.');
    const x=cotizar(q.precio,q.costo,q.cantidad,d);
    const nuevo=await uno(`UPDATE cotizaciones SET descuento_pct=$2,subtotal=$3,igv=$4,total=$5,version=version+1,estado='EN_NEGOCIACION',actualizado_en=now() WHERE id_cotizacion=$1 RETURNING *`,[id,d,x.subtotal,x.igv,x.total]);
    await consulta('UPDATE cotizacion_detalle SET descuento_pct=$2,subtotal=$3 WHERE id_cotizacion=$1',[id,d,x.subtotal]);
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
  if(!descuentoPermitido(q.precio,q.costo,q.margen_minimo,s.ofrecido_pct)) falla('El descuento dejó de cumplir el margen mínimo. Solicita nueva evaluación.');
  const x=cotizar(q.precio,q.costo,q.cantidad,s.ofrecido_pct);
  const nuevo=await uno(`UPDATE cotizaciones SET descuento_pct=$2,subtotal=$3,igv=$4,total=$5,estado='EN_NEGOCIACION',version=version+1,actualizado_en=now() WHERE id_cotizacion=$1 RETURNING *`,[s.id_cotizacion,s.ofrecido_pct,x.subtotal,x.igv,x.total]);
  await consulta('UPDATE cotizacion_detalle SET descuento_pct=$2,subtotal=$3 WHERE id_cotizacion=$1',[q.id_cotizacion,s.ofrecido_pct,x.subtotal]);
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
  const q=await cotizacion(id);if(q.estado==='CONFIRMADA')falla('El pedido ya está confirmado.');
  const available=await disponibilidad(q.id_producto),hoy=fechaLimaHoy();
  const s=repartoSugerido(q.cantidad,available.disponibles,available.planificadas,available.planes[0]?.fecha_disponibilidad?hoyFecha(available.planes[0].fecha_disponibilidad):null,hoy);
  let partes=[];
  if(datos.modo==='DOS_PARTES'){
    if(s.sin_cobertura)falla('No hay producción programada suficiente para completar el pedido. Debe intervenir Planeamiento.');
    partes=s.faltante?[{cajas:s.inmediato,fecha:s.fecha1},{cajas:s.faltante,fecha:s.fecha2}]:[{cajas:q.cantidad,fecha:s.fecha1}];
  } else if(datos.modo==='TODO_DESPUES'){
    if(s.sin_cobertura)falla('No hay producción programada suficiente para la cantidad solicitada.');
    partes=[{cajas:q.cantidad,fecha:datos.fecha||(s.faltante?s.fecha2:s.fecha1)}];
  } else if(datos.modo==='PERSONALIZADA') partes=datos.partes;
  else falla('Modo de entrega inválido.');
  if(partes.some(x=>!x.cajas))falla('Revisa la distribución de cajas de la propuesta.');
  if(partes.reduce((a,x)=>a+Number(x.cajas),0)!==Number(q.cantidad))falla('Las entregas deben sumar la cantidad completa de la cotización.');
  const reparto=validarPartes(partes,available,hoy);
  await consulta(`UPDATE cotizaciones SET entregas=$2::jsonb,entrega_aceptada=false,version=version+1,actualizado_en=now() WHERE id_cotizacion=$1`,[id,json(reparto)]);
  return {mensaje:`Propuesta registrada: ${partes.map(x=>`${x.cajas} cajas el ${x.fecha}`).join(' y ')}. Las fechas están sujetas a confirmación logística y, en producción, a liberación QM. ¿La aceptas?`,cotizacion:await detalleCotizacion(id)};
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
  try {
    await cn.query('BEGIN');
    const rq=await cn.query(`SELECT q.*,p.precio,p.costo,p.margen_minimo,c.linea_credito,c.deuda_vigente,c.plazo_credito_dias FROM cotizaciones q JOIN productos p ON p.id_producto=q.id_producto JOIN clientes c ON c.id_cliente=q.id_cliente WHERE q.id_cotizacion=$1 FOR UPDATE OF q,c`,[id]);
    const q=rq.rows[0];if(!q)falla('Cotización no encontrada.');
    if(q.estado==='CONFIRMADA')falla('Este pedido ya fue confirmado.');
    if(!q.direccion_confirmada)falla('Falta confirmar la dirección de entrega del cliente.');
    if(!q.entrega_aceptada||!q.entregas?.length)falla('El cliente debe aceptar primero las entregas y fechas propuestas.');
    if(q.forma_pago==='SIN_DEFINIR')falla('El cliente debe definir cómo pagará.');
    const pendientes=await cn.query(`SELECT 1 FROM solicitudes_descuento WHERE id_cotizacion=$1 AND estado IN ('PENDIENTE_JEFATURA','OFERTADO') LIMIT 1`,[id]);
    if(pendientes.rowCount)falla('Falta la decisión de Jefatura Comercial o la aceptación del cliente.');
    if(!descuentoPermitido(q.precio,q.costo,q.margen_minimo,q.descuento_pct))falla('El margen mínimo no se cumple.');
    const x=cotizar(q.precio,q.costo,q.cantidad,q.descuento_pct);
    if(q.forma_pago==='CREDITO' && Number(q.linea_credito)-Number(q.deuda_vigente)<x.total)falla('La línea de crédito ya no alcanza; consultar Finanzas.');
    const stock=await cn.query(`SELECT * FROM stock_lotes WHERE id_producto=$1 AND calidad='LIBERADO' AND fecha_vencimiento>current_date ORDER BY fecha_vencimiento FOR UPDATE`,[q.id_producto]);
    const plan=await cn.query(`SELECT * FROM plan_produccion WHERE id_producto=$1 AND estado='PROGRAMADO' AND fecha_disponibilidad>=current_date ORDER BY fecha_disponibilidad FOR UPDATE`,[q.id_producto]);
    const lotes=[];for(const r of stock.rows){const prev=await cn.query('SELECT COALESCE(SUM(cajas),0)::int AS usados FROM reservas_stock WHERE id_lote=$1',[r.id_lote]);lotes.push({...r,libres:r.cajas-Number(prev.rows[0].usados)});}
    const planes=[];for(const r of plan.rows){const prev=await cn.query('SELECT COALESCE(SUM(cajas),0)::int AS usados FROM asignaciones_produccion WHERE id_plan=$1',[r.id_plan]);planes.push({...r,libres:r.cajas-Number(prev.rows[0].usados)});}
    const asignacionesStock=[],asignacionesPlan=[];
    let suma=0,condicional=false;
    for(const parte of q.entregas){
      const cajas=entero(parte.cajas,'Cajas');suma+=cajas;let restante=cajas;
      if(!fechaValida(parte.fecha)||parte.fecha<fechaLimaHoy())falla('Una fecha de entrega ya pasó; negocia una nueva.');
      if(parte.origen==='STOCK'){
        for(const lote of lotes){if(!restante)break;const usadas=Math.min(restante,lote.libres);if(usadas>0){asignacionesStock.push({id:lote.id_lote,cajas:usadas});lote.libres-=usadas;restante-=usadas;}}
      } else if(parte.origen==='PRODUCCION'){
        condicional=true;
        for(const p of planes){if(!restante)break; if(parte.fecha>=hoyFecha(p.fecha_disponibilidad)){const usadas=Math.min(restante,p.libres);if(usadas>0){asignacionesPlan.push({id:p.id_plan,cajas:usadas});p.libres-=usadas;restante-=usadas;}}}
      } else falla('Origen de entrega desconocido.');
      if(restante)falla(`La disponibilidad cambió: faltan ${restante} cajas para el tramo del ${parte.fecha}. Debes revalidar la propuesta.`);
    }
    if(suma!==q.cantidad)falla('Las entregas no cubren la cantidad del pedido.');
    const order=await cn.query(`INSERT INTO pedidos(id_cotizacion,id_cliente,estado,total,entregas,forma_pago) VALUES($1,$2,$3,$4,$5::jsonb,$6) RETURNING *`,[id,q.id_cliente,condicional?'PROGRAMADO_CONDICIONAL':'REGISTRADO',x.total,json(q.entregas),q.forma_pago]);
    for(const [i,parte] of q.entregas.entries())await cn.query(`INSERT INTO entregas(id_pedido,numero_parte,cajas,fecha_propuesta,origen,estado) VALUES($1,$2,$3,$4,$5,$6)`,[order.rows[0].id_pedido,i+1,parte.cajas,parte.fecha,parte.origen,parte.origen==='PRODUCCION'?'PROGRAMADA_CONDICIONAL':'PROPUESTA_DESPACHO']);
    const hoy=fechaLimaHoy();
    if(q.forma_pago==='CREDITO'){
      const vence=sumarDias(hoy,Number(rq.rows[0].plazo_credito_dias||30));
      await cn.query('INSERT INTO pagos(id_pedido,tipo,monto,fecha_vencimiento) VALUES($1,$2,$3,$4)',[order.rows[0].id_pedido,'CREDITO',x.total,vence]);
    }else if(q.forma_pago==='ANTICIPO'){
      const anticipo=Math.round(x.total*0.4*100)/100;
      await cn.query('INSERT INTO pagos(id_pedido,tipo,monto,fecha_vencimiento) VALUES($1,$2,$3,$4)',[order.rows[0].id_pedido,'ANTICIPO_40',anticipo,hoy]);
      await cn.query('INSERT INTO pagos(id_pedido,tipo,monto,fecha_vencimiento) VALUES($1,$2,$3,$4)',[order.rows[0].id_pedido,'SALDO_60',Math.round((x.total-anticipo)*100)/100,hoy]);
    }else await cn.query('INSERT INTO pagos(id_pedido,tipo,monto,fecha_vencimiento) VALUES($1,$2,$3,$4)',[order.rows[0].id_pedido,'CONTADO',x.total,hoy]);
    for(const a of asignacionesStock)await cn.query('INSERT INTO reservas_stock(id_pedido,id_lote,cajas) VALUES($1,$2,$3)',[order.rows[0].id_pedido,a.id,a.cajas]);
    for(const a of asignacionesPlan)await cn.query('INSERT INTO asignaciones_produccion(id_pedido,id_plan,cajas) VALUES($1,$2,$3)',[order.rows[0].id_pedido,a.id,a.cajas]);
    if(q.forma_pago==='CREDITO')await cn.query('UPDATE clientes SET deuda_vigente=deuda_vigente+$2 WHERE id_cliente=$1',[q.id_cliente,x.total]);
    await cn.query(`UPDATE cotizaciones SET estado='CONFIRMADA',actualizado_en=now() WHERE id_cotizacion=$1`,[id]);
    await cn.query('COMMIT');
    return {mensaje:condicional?'Pedido comercial registrado. La parte de producción queda CONDICIONAL hasta la liberación QM y validación logística; no se promete despacho definitivo.':'Pedido registrado. Las fechas propuestas siguen sujetas a confirmación logística.',pedido:order.rows[0]};
  }catch(err){await cn.query('ROLLBACK');if(err.code==='23505')falla('La cotización ya tiene un pedido registrado.');throw err;}finally{cn.release();}
}
export async function listarAprobaciones(rol) {
  if(rol==='finanzas')return consulta(`SELECT s.*,c.razon_social,c.linea_credito,c.plazo_credito_dias FROM solicitudes_credito s JOIN clientes c USING(id_cliente) ORDER BY s.creado_en DESC LIMIT 50`);
  if(rol==='jefatura')return consulta(`SELECT s.*,c.razon_social,q.cantidad,q.total,p.nombre as producto_nombre,p.precio,p.costo,p.margen_minimo FROM solicitudes_descuento s JOIN clientes c USING(id_cliente) JOIN cotizaciones q ON q.id_cotizacion=s.id_cotizacion JOIN productos p ON p.id_producto=q.id_producto ORDER BY s.creado_en DESC LIMIT 50`);
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
    if(!descuentoPermitido(q.precio,q.costo,q.margen_minimo,offered))falla('Ese descuento infringe el margen mínimo del producto. Ofrece un porcentaje menor.');
  }
  const estado=decision==='RECHAZAR'?'RECHAZADA_JEFATURA':'OFERTADO';
  const r=await uno(`UPDATE solicitudes_descuento SET estado=$2,ofrecido_pct=$3,comentario=$4,responsable='Jefatura Comercial (demo)',decidido_en=now() WHERE id_solicitud=$1 AND estado='PENDIENTE_JEFATURA' RETURNING *`,[id,estado,offered,(comentario||'').slice(0,500)]);
  if(!r)falla('La solicitud ya fue evaluada.');
  if(decision==='RECHAZAR')await consulta(`UPDATE cotizaciones SET estado='EN_NEGOCIACION' WHERE id_cotizacion=$1`,[s.id_cotizacion]);
  return {mensaje:decision==='RECHAZAR'?'Jefatura rechazó el descuento; el agente debe ofrecer alternativas.':`Jefatura autorizó ofrecer ${offered} %. Falta la aceptación del cliente para aplicar la cotización.`,solicitud:r};
}
