import { enSimulacion } from '../lib/db.js';
import { respuesta,errorJson,metodo,falla } from '../lib/http.js';
import {crearCotizacion,modificarCotizacion,solicitarDescuento,clienteRespondeDescuento,crearCliente,solicitarCredito,clienteRespondeCredito,proponerEntrega,aceptarEntrega,confirmarDireccion,definirPago,confirmarPedido,detalleCotizacion,cambiarLinea} from '../lib/service.js';
const acciones={
  crear_cotizacion:x=>crearCotizacion(x.id_cliente,x.id_producto,x.cantidad),
  agregar_producto:x=>cambiarLinea(x.id_cotizacion,x.id_producto,x.cantidad,{modo:'AGREGAR'}),
  actualizar_producto:x=>cambiarLinea(x.id_cotizacion,x.id_producto,x.cantidad,{modo:'FIJAR'}),
  quitar_producto:x=>cambiarLinea(x.id_cotizacion,x.id_producto,1,{modo:'QUITAR'}),
  modificar_cotizacion:x=>modificarCotizacion(x.id_cotizacion,x.cambios),
  solicitar_descuento:x=>solicitarDescuento(x.id_cotizacion,x.porcentaje),
  responder_descuento:x=>clienteRespondeDescuento(x.id_solicitud,!!x.aceptar),
  nuevo_cliente:x=>crearCliente(x.datos||{}),
  solicitar_credito:x=>solicitarCredito(x.id_cliente,x.monto,x.plazo_dias),
  responder_credito:x=>clienteRespondeCredito(x.id_solicitud,!!x.aceptar),
  proponer_entrega:x=>proponerEntrega(x.id_cotizacion,x.datos||{}),
  aceptar_entrega:x=>aceptarEntrega(x.id_cotizacion,!!x.aceptar),
  confirmar_direccion:x=>confirmarDireccion(x.id_cotizacion,x.id_direccion),
  definir_pago:x=>definirPago(x.id_cotizacion,x.modalidad),
  confirmar_pedido:x=>confirmarPedido(x.id_cotizacion),
  detalle_cotizacion:x=>detalleCotizacion(x.id_cotizacion)
};
async function atender(req,res){
  try {metodo(req,['POST']);
    const action=req.body?.accion;
    if(!Object.hasOwn(acciones,action))falla('Acción no reconocida.');
    const resultado=await acciones[action](req.body||{});
    respuesta(res,200,{ok:true,resultado});
  }catch(err){errorJson(res,err);}
}

// Las operaciones comerciales, el historial y las aprobaciones pertenecen a la sesión de esta pestaña.
export default async function handler(req,res){
  try {
    await enSimulacion(req,()=>atender(req,res));
  }catch(err){errorJson(res,err);}
}
