// Conserva la fecha como preferencia y la valida otra vez con las cantidades nuevas.
export async function revisarTrasCambio(anterior,actual,estado,proponer){
 delete estado.cambio_multi;delete estado.cambio_seleccion;
 estado.confirmacion_final=null;estado.descuento_consultado=false;
 const descuento=Number(anterior.descuento_pct)||0;
 let aviso=descuento?`El descuento anterior de ${descuento}% necesita una nueva evaluación; por ahora el total se calcula sin ese descuento.`:'Revisaremos el descuento con las cantidades actualizadas.';
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
