import { enSimulacion } from '../lib/db.js';
import {respuesta,errorJson,metodo,falla} from '../lib/http.js';
import {listarAprobaciones,decidirCredito,decidirDescuento} from '../lib/service.js';
async function atender(req,res){
  try{
    metodo(req,['GET','POST']);
    const rol=req.method==='GET'?req.query?.rol:req.body?.rol;
    if(!['finanzas','jefatura'].includes(rol))falla('Selecciona Finanzas o Jefatura.');
    if(req.method==='GET')return respuesta(res,200,{ok:true,solicitudes:await listarAprobaciones(rol)});
    const x=req.body||{};
    const resultado=rol==='finanzas'?
      await decidirCredito(x.id_solicitud,x.decision,x.monto,x.plazo_dias,x.comentario):
      await decidirDescuento(x.id_solicitud,x.decision,x.porcentaje,x.comentario);
    respuesta(res,200,{ok:true,resultado});
  }catch(err){errorJson(res,err);}
}

// Las operaciones comerciales, el historial y las aprobaciones pertenecen a la sesión de esta pestaña.
export default async function handler(req,res){
  try {
    await enSimulacion(req,()=>atender(req,res));
  }catch(err){errorJson(res,err);}
}
