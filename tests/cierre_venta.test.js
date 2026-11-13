import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {leerTurno, esConfirmacionCorta, confirmaReduccion, esAceptacionDescuento} from '../lib/dialogo.js';
import {temaConsulta} from '../lib/ai.js';
import {firmaCondiciones,confirmacionVigente,resumenHabilitado} from '../lib/negociacion.js';

const q={
 id_cotizacion:'c1',version:6,estado:'EN_NEGOCIACION',id_producto:'PRD-003',cantidad:150,
 descuento_pct:8,total:10096.08,forma_pago:'CREDITO',linea_credito:30000,deuda_vigente:0,
 direccion_confirmada:true,id_direccion:'ate-nueva',entrega_aceptada:true,
 entregas:[{cajas:90,fecha:'2026-11-14',origen:'STOCK'},{cajas:60,fecha:'2026-11-17',origen:'PRODUCCION'}],
 aprobaciones:[{estado:'ACEPTADA_CLIENTE',ofrecido_pct:8}]
};
const ctx={estado:{producto:'PRD-003',esperando:'ACEPTAR_ENTREGA',hoy:'2026-11-13'},cotizacion:q,interpretacion:{accion:'cotizar',cantidad:150}};
test('Una entrega parcial no se interpreta como reducir la cantidad del cliente',()=>{
 const d=leerTurno('Sí, una entrega parcial',ctx);
 assert.equal(d.accion,'ENTREGA');
 assert.equal(d.modo,'DOS_PARTES');
 assert.equal(confirmaReduccion('Sí, una entrega parcial',150),false);
 assert.equal(confirmaReduccion('Si acepto 150 en partes',150),false);
 assert.equal(confirmaReduccion('reducir a 150 cajas',150),true);
 assert.equal(confirmaReduccion('reducir a 200 cajas',150),false);
});
test('La petición posterior de recibir 150 juntas exige modificar la entrega anterior',()=>{
 const d=leerTurno('las 150 juntas',ctx);
 assert.equal(d.accion,'ENTREGA');
 assert.equal(d.modo,'TODO_DESPUES');
 const backend=readFileSync(new URL('../api/chat.js',import.meta.url),'utf8');
 const service=readFileSync(new URL('../lib/service.js',import.meta.url),'utf8');
 assert.match(backend,/proponerEntrega\(q\.id_cotizacion,\{modo:'TODO_DESPUES',fecha:target\}\)/);
 assert.match(service,/entrega_aceptada=false,version=version\+1/);
});
test('Preguntar por el descuento no crea una segunda solicitud',()=>{
 const t='¿Ya se aceptó mi descuento?';
 assert.equal(temaConsulta(t),'descuento');
 assert.equal(leerTurno(t,ctx).accion,'CONSULTAR');
 assert.equal(esAceptacionDescuento('acepto el descuento ya te di mi dirección'),true);
 assert.equal(esAceptacionDescuento(t),false);
});
test('Sí sencillo responde a una oferta o al resumen final; no a cualquier otra frase',()=>{
 assert.equal(esConfirmacionCorta('Sí'),true);
 assert.equal(esConfirmacionCorta('sí, está bien'),true);
 assert.equal(esConfirmacionCorta('sí, una entrega parcial'),false);
 assert.equal(esConfirmacionCorta('sí, pero cambia la fecha'),false);
});
test('El cierre exige la misma versión, producto, cantidad y entregas acordadas',()=>{
 const estado={confirmacion_final:{id:q.id_cotizacion,firma:firmaCondiciones(q)}};
 assert.equal(resumenHabilitado(q),true);
 assert.equal(confirmacionVigente(q,estado),true);
 assert.equal(confirmacionVigente({...q,version:7},estado),false);
 assert.equal(confirmacionVigente({...q,cantidad:200},estado),false);
 assert.equal(confirmacionVigente({...q,entregas:[{cajas:150,fecha:'2026-11-17',origen:'STOCK'}]},estado),false);
 assert.equal(confirmacionVigente({...q,descuento_pct:5},estado),false);
 assert.equal(confirmacionVigente({...q,id_direccion:'otra-calle'},estado),false);
 assert.equal(confirmacionVigente({...q,forma_pago:'CONTADO'},estado),false);
 assert.equal(confirmacionVigente({...q,estado:'CONFIRMADA'},estado),false);
});
test('No confirma si falta entrega aceptada, aprobación o crédito',()=>{
 const estado={confirmacion_final:{id:q.id_cotizacion,firma:firmaCondiciones(q)}};
 assert.equal(confirmacionVigente({...q,entrega_aceptada:false},estado),false);
 assert.equal(confirmacionVigente({...q,aprobaciones:[{estado:'OFERTADO',ofrecido_pct:8}]},estado),false);
 assert.equal(confirmacionVigente({...q,linea_credito:100},estado),false);
});
test('El chat ejecuta confirmarPedido con sí final solo si firma vigente',()=>{
 const backend=readFileSync(new URL('../api/chat.js',import.meta.url),'utf8');
 assert.match(backend,/estado\.esperando==='CONFIRMAR_PEDIDO' && esConfirmacionCorta\(texto\)/);
 assert.match(backend,/if\(confirmacionVigente\(q,estado\) && ultimaRespuestaPidePedido\(ultimoAgente\)\)/);
 assert.match(backend,/estado\.esperando==='ACEPTAR_DESCUENTO'/);
 assert.match(backend,/esAceptacionDescuento\(texto\)/);
});
test('El resumen del pedido muestra reserva y saldo posterior separadamente',()=>{
 const ui=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 assert.match(ui,/Stock reservado para este pedido/);
 assert.match(ui,/Stock libre tras la reserva/);
 assert.match(ui,/reservadas/);
});
test('Un sí final requiere que el último mensaje del agente haya pedido confirmar el pedido',async()=>{
 const {ultimaRespuestaPidePedido,ultimaRespuestaPideDescuento}=await import('../lib/dialogo.js');
 assert.equal(ultimaRespuestaPidePedido('Ya acordamos todo. ¿Confirmas el pedido con esas condiciones?'),true);
 assert.equal(ultimaRespuestaPidePedido('Hay 90 cajas de leche fresca en stock.'),false);
 assert.equal(ultimaRespuestaPideDescuento('Jefatura autorizó ofrecer 8%. ¿Aceptas ese descuento?'),true);
 assert.equal(ultimaRespuestaPideDescuento('Jefatura autorizó ofrecer 8%, pero falta que tú lo aceptes.'),true);
 assert.equal(ultimaRespuestaPideDescuento('Tu línea de crédito está aprobada.'),false);
 const code=readFileSync(new URL('../api/chat.js',import.meta.url),'utf8');
 assert.match(code,/confirmacionVigente\(q,estado\) && ultimaRespuestaPidePedido\(ultimoAgente\)/);
 assert.match(code,/esConfirmacionCorta\(texto\) && ultimaRespuestaPideDescuento\(ultimoAgente\)/);
});
test('No acepta entregas o direcciones con frases ambiguas como «ok quiero ver»',async()=>{
 const {esAceptacionEntrega,esAceptacionDireccion,esConfirmacionCorta}=await import('../lib/dialogo.js');
 assert.equal(esConfirmacionCorta('ok quiero ver'),false);
 assert.equal(esAceptacionEntrega('ok quiero ver'),false);
 assert.equal(esAceptacionDireccion('ok quiero ver'),false);
 assert.equal(esAceptacionEntrega('acepto la entrega'),true);
 assert.equal(esAceptacionDireccion('confirmo la dirección'),true);
 assert.equal(esConfirmacionCorta('si estabien'),true);
 const code=readFileSync(new URL('../api/chat.js',import.meta.url),'utf8');
 assert.match(code,/estado\.esperando==='ACEPTAR_ENTREGA'.*esAceptacionEntrega\(texto\)/);
 assert.match(code,/estado\.esperando==='ACEPTAR_DIRECCION_NUEVA'.*esAceptacionDireccion\(texto\)/);
});
