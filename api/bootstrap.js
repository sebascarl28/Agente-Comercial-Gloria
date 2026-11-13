import { respuesta,errorJson,revisarAcceso,metodo } from '../lib/http.js';
import { clientesYCatalogo,contextoCliente,detalleCotizacion,disponibilidad } from '../lib/service.js';
export default async function handler(req,res){
  try{
    metodo(req,['GET']);revisarAcceso(req);
    const base=await clientesYCatalogo();
    const cliente_id=req.query?.cliente_id||base.clientes[0]?.id_cliente;
    const cliente=cliente_id?await contextoCliente(cliente_id):null;
    const cotizacion_id=req.query?.cotizacion_id||cliente?.ultima_conversacion?.id_cotizacion;
    const cotizacion=cotizacion_id?await detalleCotizacion(cotizacion_id):null;
    if(cotizacion&&cotizacion.id_cliente!==cliente_id)throw Object.assign(new Error('Cotización no corresponde al cliente seleccionado.'),{status:403});
    const stocks=await Promise.all(base.productos.map(async p=>({id_producto:p.id_producto,...await disponibilidad(p.id_producto)})));
    respuesta(res,200,{ok:true,...base,cliente, cotizacion, stocks});
  }catch(err){errorJson(res,err);}
}
