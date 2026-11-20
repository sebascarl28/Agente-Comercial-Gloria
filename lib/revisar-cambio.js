// Conserva la fecha como preferencia y la valida otra vez con las cantidades nuevas.
export async function revisarTrasCambio(anterior,actual,estado,proponer){
 delete estado.cambio_multi;delete estado.cambio_seleccion;
 estado.confirmacion_final=null;
 const descuento=Number(anterior.descuento_pct)||0;
 const descuentoElegido=estado.descuento_consultado;
 estado.descuento_por_renovar=descuento>0&&descuentoElegido?descuento:null;
 estado.descuento_consultado=descuentoElegido&&!descuento;
 let aviso=descuento?`Tu descuento anterior de ${descuento}% requiere otra evaluación con las nuevas cantidades; volveré a solicitarlo después de que aceptes la entrega. Por ahora el total se calcula sin ese descuento.`:descuentoElegido?'Conservo tu elección de continuar sin descuento.':'Podrás elegir un descuento después de aceptar la entrega.';
 const fechas=[...new Set((anterior.entregas||[]).map(x=>String(x.fecha).slice(0,10)))];
 if(fechas.length===1){
   estado.fecha_deseada=fechas[0];
   try{
     const r=await proponer(actual.id_cotizacion,{modo:'TODO_DESPUES',fecha:fechas[0]});
     estado.esperando='ACEPTAR_ENTREGA';
     return {cotizacion:r.cotizacion,mensaje:`Mantuve el ${fechas[0].split('-').reverse().join('/')} como fecha solicitada y revisé las nuevas cantidades. ${aviso}\n${r.mensaje}`};
   }catch(err){
     if(Number(err?.status)>=500)throw err;
     estado.esperando='ELEGIR_FECHA';
     return {cotizacion:actual,mensaje:`Conservé los cambios de cantidades, pero no pude validar la misma fecha: ${err.message}. ${aviso} ¿Qué otra fecha prefieres?`};
   }
 }
 return {cotizacion:actual,mensaje:null,aviso};
}
