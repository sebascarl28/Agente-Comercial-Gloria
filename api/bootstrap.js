import {esEscenarioPC3} from '../lib/escenario.js';
import {consulta} from '../lib/db.js';
import { enSimulacion } from '../lib/db.js';
import { respuesta,errorJson,revisarAcceso,metodo } from '../lib/http.js';
import { clientesYCatalogo,contextoCliente,detalleCotizacion,disponibilidad } from '../lib/service.js';
async function atender(req,res){
  try{
    metodo(req,['GET']);revisarAcceso(req);
    const base=await clientesYCatalogo();
    const cliente_id=req.query?.cliente_id||base.clientes[0]?.id_cliente;
    const cliente=cliente_id?await contextoCliente(cliente_id):null;
    const cotizacion_id=req.query?.cotizacion_id||cliente?.ultima_conversacion?.id_cotizacion;
    const cotizacion=cotizacion_id?await detalleCotizacion(cotizacion_id):null;
    if(cotizacion&&cotizacion.id_cliente!==cliente_id)throw Object.assign(new Error('Cotización no corresponde al cliente seleccionado.'),{status:403});
    const stocks=await Promise.all(base.productos.map(async p=>({id_producto:p.id_producto,...await disponibilidad(p.id_producto)})));
    const escenario_pc3=esEscenarioPC3()?{
      fecha_corte:'2026-11-13',fecha_solicitada:'2026-11-16',fecha_alternativa:'2026-11-17',
      solicitud:{uht:180,evaporada:60,fresca:120,total:360},
      cobertura:{uht:180,evaporada:40,fresca:120,total:340},
      falta_evaporada:20,referencia_produccion:'OP-EVA-1711',
      demanda_linea:18000,capacidad_nominal:19200,capacidad_ajustada:17600,brecha_linea:400,
      mantenimiento:(await consulta('SELECT * FROM pc3_mantenimiento ORDER BY fecha'))
    }:null;
    respuesta(res,200,{ok:true,...base,cliente, cotizacion, stocks,escenario_pc3});
  }catch(err){errorJson(res,err);}
}

// Las operaciones comerciales, el historial y las aprobaciones pertenecen a la sesión de esta pestaña.
export default async function handler(req,res){
  try {
    await enSimulacion(req,()=>atender(req,res));
  }catch(err){errorJson(res,err);}
}
