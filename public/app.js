const $ = (sel,root=document) => root.querySelector(sel);
const $$ = (sel,root=document) => [...root.querySelectorAll(sel)];
const ES_CASO_PC3=new URLSearchParams(location.search).get('escenario')==='pc3';
const PENDIENTE_MENSAJE_PC3='gloria_demo_pc3_mensaje_pendiente';
function solicitaCasoPC3(texto=''){
  const m=String(texto).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  return /\b(?:caso\s+pc\s*3|escenario\s+pc\s*3|caso\s+del\s+informe)\b/.test(m)
    && /\b(?:quiero|prepara|preparar|iniciar|inicia|simular|mostrar|probar|trabajar|activar)\b/.test(m);
}
const DEMO_SESION_KEY=ES_CASO_PC3?'gloria_demo_session_pc3_informe':'gloria_demo_session_v1';
function nuevaSesionId(){
  const id=crypto.randomUUID();
  sessionStorage.setItem(DEMO_SESION_KEY,id);
  return id;
}
const sesionActual=sessionStorage.getItem(DEMO_SESION_KEY)||nuevaSesionId();
const app={sesionId:sesionActual,view:'chat' ,clienteId:'CLI-LA-001',cotizacionId:null,conversacionId:null,mensajes:[],datos:null,staff:{finanzas:[],jefatura:[]},pins:{finanzas:sessionStorage.getItem('finanzas_pin')||'',jefatura:sessionStorage.getItem('jefatura_pin')||''},demoPin:sessionStorage.getItem('demo_pin')||'',ultimoMotor:null,diagnosticoGroq:null,busy:false};
const esc=x=>String(x??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const money=x=>new Intl.NumberFormat('es-PE',{style:'currency',currency:'PEN'}).format(Number(x||0));
const day=x=>!x?'—':new Date(String(x).slice(0,10)+'T12:00:00Z').toLocaleDateString('es-PE',{day:'2-digit',month:'2-digit',year:'numeric',timeZone:'UTC'});
const badge=(v,style='neutral')=>`<span class="badge ${style}">${esc(v)}</span>`;
const head=(icon,title,subtitle)=>`<div class="page-heading"><div class="heading-icon">${icon}</div><div><h1>${esc(title)}</h1><p>${esc(subtitle)}</p></div></div>`;
const button=(txt,attr='',variant='secondary')=>`<button type="button" class="btn ${variant}" ${attr}>${esc(txt)}</button>`;
const nombreCliente=()=>app.datos?.cliente?.cliente?.razon_social||'Seleccionar cliente';
const quote=()=>app.datos?.cotizacion;
// El resumen SOLO aparece al cerrar la negociación; una cotización borrador permanece en el chat.
function mostrarResumenFinal(q){
  if(!q)return false;
  if(q.estado==='CONFIRMADA')return true;
  const pendiente=(q.aprobaciones||[]).some(x=>['PENDIENTE_JEFATURA','OFERTADO'].includes(x.estado));
  const creditoOk=q.forma_pago!=='CREDITO'||(Number(q.linea_credito)-Number(q.deuda_vigente)>=Number(q.total));
  return !!q.direccion_confirmada && !!q.entrega_aceptada && !!q.entregas?.length &&
    !!q.forma_pago && q.forma_pago!=='SIN_DEFINIR' && !pendiente && creditoOk;
}
const dato=(str)=>esc(str);
let toastTimer;
function toast(mensaje,esError=false){const t=$('#toast');t.textContent=mensaje;t.className='toast'+(esError?' error':'');t.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>{t.hidden=true},6000);}
async function api(url,{method='GET',body,staff}={}){
  const headers={'Content-Type':'application/json','X-Demo-Session':app.sesionId,'X-Demo-Scenario':ES_CASO_PC3?'pc3':'normal'};
  if(app.demoPin)headers['X-Demo-Pin']=app.demoPin;
  if(staff)headers['X-Staff-Pin']=app.pins[staff]||'';
  const r=await fetch(url,{method,headers,body:body?JSON.stringify(body):undefined,cache:'no-store'});
  let data;try{data=await r.json()}catch{throw new Error(`Error HTTP ${r.status} (revisa Vercel).`)}
  if(!r.ok||!data.ok)throw new Error(data.error||`Error HTTP ${r.status}`);
  return data;
}
async function cargar({silencioso=false}={}){
  try{
    const qs=new URLSearchParams({cliente_id:app.clienteId});if(app.cotizacionId)qs.set('cotizacion_id',app.cotizacionId);
    const d=await api('/api/bootstrap?'+qs);
    app.datos=d;
    if(!app.conversacionId && d.cliente?.ultima_conversacion){
      app.conversacionId=d.cliente.ultima_conversacion.id_conversacion;
      app.mensajes=d.cliente.ultima_conversacion.mensajes||[];
    }
    if(!app.cotizacionId && d.cotizacion?.id_cotizacion)app.cotizacionId=d.cotizacion.id_cotizacion;
    if(!d.cliente && d.clientes.length)app.clienteId=d.clientes[0].id_cliente;
    render();
  }catch(err){
    if(err.message.includes('clave de acceso')){
      $('#workspace').innerHTML=head('🔐','Acceso a la demostración','Introduce la clave establecida en Vercel.')+`<div class="card panel"><form id="demoPinForm"><label class="field">Clave de acceso<input name="pin" type="password" required autofocus autocomplete="off"/></label><br/><button class="btn" type="submit">Ingresar</button></form></div>`;
    }else if(silencioso)toast(err.message,true);
    else $('#workspace').innerHTML=head('⚠️','Configuración pendiente','Conecta Supabase y ejecuta el SQL del proyecto nuevo.')+`<div class="notice warn"><strong>${esc(err.message)}</strong><p>Revisa el archivo <code>README.md</code>, configura <code>DATABASE_URL</code> en Vercel y ejecuta <code>01_esquema.sql</code> y <code>02_datos_demo.sql</code> en Supabase.</p></div>`;
  }
}
function elegirVista(view){app.view=view;render();if(['finanzas','jefatura'].includes(view)&&app.pins[view])cargarStaff(view);}
function cambiarCliente(id){app.clienteId=id;app.cotizacionId=null;app.conversacionId=null;app.mensajes=[];app.view='chat';cargar();}
function menu(){
  $$('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===app.view));
  $$('[data-top]').forEach(b=>b.classList.toggle('selected',b.dataset.top===(['finanzas','jefatura'].includes(app.view)?app.view:'chat')));
  $('#dateBadge').textContent=new Intl.DateTimeFormat('es-PE',{timeZone:'America/Lima',weekday:'short',day:'2-digit',month:'short',year:'numeric'}).format(new Date());
}
function render(){menu();if(!app.datos)return;
  const v=app.view;
  $('#workspace').innerHTML=v==='chat'?chatView():v==='clientes'?clientesView():v==='productos'?productosView():v==='cotizaciones'?cotizacionesView():v==='pedidos'?pedidosView():v==='stock'?stockView():v==='produccion'?produccionView():v==='finanzas'||v==='jefatura'?staffView(v):chatView();
  if(v==='chat'){const box=$('.chat-messages');if(box)box.scrollTop=box.scrollHeight;}
}
function barCliente(){const c=app.datos.cliente?.cliente;return `<div class="client-bar card"><strong>Cliente:</strong><select id="selectCliente" aria-label="Seleccionar cliente">${app.datos.clientes.map(x=>`<option value="${esc(x.id_cliente)}" ${x.id_cliente===app.clienteId?'selected':''}>${esc(x.razon_social)}</option>`).join('')}</select>${c?`<div class="credit">${Number(c.linea_credito)>0?badge('✓ Crédito aprobado','success'):badge('Sin crédito aprobado','warn')}<small>Línea: ${money(c.linea_credito)} &nbsp; | &nbsp; Plazo: ${c.plazo_credito_dias||0} días</small></div>`:''}</div>`;}
function welcome(){return [{rol:'agente',texto:`¡Hola! Soy el Agente Comercial Gloria 👋\nYa tengo registrada a ${nombreCliente()}.\n¿En qué puedo ayudarte hoy?`,fecha:new Date().toISOString()}];}
function sugerenciasDelMomento(q){
  const ultimo=[...app.mensajes].reverse().find(m=>m.rol==='agente'&&m.estado_chat);
  const estado=ultimo?.estado_chat||{};
  const espera=estado.esperando;
  if(espera==='ELEGIR_ACCION_MULTIPRODUCTO')return [['Reemplazar cantidades','Quiero modificar'],['Sumar esas cajas','Quiero sumar'],['Cancelar cambio','Cancelar']];
  if(espera==='SELECCIONAR_LECHES')return [['Leche UHT entera','Leche entera'],['Leche evaporada','Leche evaporada'],['Leche fresca','Leche fresca']];
  if(espera==='CANTIDAD_SELECCION'){
    const faltan=(estado.seleccion_productos?.items||[]).filter(x=>x.cantidad===null).length;
    return faltan>1?[['50 de cada una','50 cajas de cada una'],['100 de cada una','100 cajas de cada una']]:[['10 cajas','10 cajas'],['30 cajas','30 cajas'],['50 cajas','50 cajas']];
  }
  if(espera==='MODIFICAR_LINEAS')return [['Ver cotización','¿Cómo va mi cotización?'],['Añadir otra leche','¿Puedo añadir otro producto?']];
  if(espera==='CONFIRMAR_TIPO_LECHE')return [['Sí, es ese','Sí'],['No, otro producto','No']];
  if(espera==='AGREGAR_PRODUCTO')return [['Leche UHT','Leche UHT'],['Leche evaporada','Leche evaporada'],['Leche fresca','Leche fresca']];
  if(espera==='ELEGIR_CAMBIO_LINEA')return [['Sumar cajas','Sumar esas cajas'],['Cambiar cantidad','Cambiar a esa cantidad']];
  if(espera==='CANTIDAD_ADICIONAL')return [['10 cajas','10 cajas'],['30 cajas','30 cajas'],['50 cajas','50 cajas']];
  if(espera==='ACEPTAR_DESCUENTO')return [['Acepto descuento','Acepto el descuento'],['Consultar Jefatura','¿Qué decidió Jefatura?'],['Seguir negociando','Quiero negociar otro descuento']];
  if(espera==='ESPERAR_JEFATURA')return [['Estado de descuento','¿Ya respondió Jefatura?'],['Revisar cotización','¿Cómo va mi cotización?']];
  if(espera==='ACEPTAR_DIRECCION_NUEVA'||espera==='CONFIRMAR_DIRECCION')return [['Confirmar dirección','Sí'],['Cambiar dirección','Quiero cambiar la dirección']];
  if(espera==='ACEPTAR_ENTREGA')return [['Aceptar entregas','Acepto la entrega'],['Quiero otra fecha','Quiero cambiar la fecha'],['Todo junto','Prefiero todo junto']];
  if(espera==='ELEGIR_PAGO')return [['Pagar a crédito','Con mi crédito aprobado'],['Pago al contado','Pagar al contado'],['Anticipo 40 %','Quiero pagar con anticipo']];
  if(espera==='DESCUENTO_OPCIONAL'||espera==='PEDIR_DESCUENTO')return [['Sin descuento','Sin descuento'],['Solicitar 5 %','Quiero 5% de descuento'],['Solicitar 8 %','Quiero 8% de descuento']];
  if(espera==='CONFIRMAR_PEDIDO'&&mostrarResumenFinal(q))return [['Confirmar pedido','Sí'],['Cambiar algo','Quiero modificar mi cotización']];
  if(espera==='ACLARAR_FECHA')return [['Vencimiento','Fecha de vencimiento'],['Entrega','Fecha de entrega']];
  if(espera==='REDUCIR_CANTIDAD'&&q)return [['Mantener cantidad','Quiero mantener el pedido completo'],['Entrega parcial','Prefiero entrega parcial'],['Revisar Planeamiento','Consultar Planeamiento']];
  if(!q)return [['Ver tipos de leche','¿Qué leches tienes?'],['Consultar stock','¿Qué stock tienes de leche UHT?'],['Cotizar leche fresca','Quiero cotizar leche fresca']];
  if(!q.entregas?.length)return [['Añadir otra leche','¿Puedo añadir otro producto?'],['Modificar cantidades','Quiero modificar'],['¿Qué stock hay?','¿Qué stock tienes del producto?'],['Negociar entrega','Quiero acordar una fecha de entrega']];
  if(!q.entrega_aceptada)return [['Aceptar propuesta','Acepto la entrega'],['Cambiar fechas','Quiero cambiar las fechas']];
  if(q.forma_pago==='SIN_DEFINIR')return [['Con mi crédito','Quiero pagar con el crédito aprobado'],['Pago contado','Quiero pagar al contado']];
  return [['Añadir otra leche','¿Puedo añadir otro producto?'],['Consultar cotización','¿Cómo va mi cotización?'],['Solicitar descuento','Quiero solicitar descuento']];
}
function panelCasoPC3(){
  const e=app.datos?.escenario_pc3;
  if(!e)return '';
  const m=e.mantenimiento?.[0];
  return `<details class="card" style="padding:12px 18px;margin:0 0 15px;border-left:4px solid #0c58ca;background:#f3f7ff">
    <summary style="cursor:pointer;font-weight:700">Caso PC3 · Datos del escenario (consulta opcional)</summary>
    <p style="margin:9px 0 5px">Solicitud: 180 cajas UHT, 60 de evaporada 400 g y 120 de fresca. Inventario liberado para el 16/11: 340 de las 360 cajas. Las otras 20 son de evaporada y se prevén desde el 17/11 por OP-EVA-1711; no hay promesa de despacho.</p>
    <p style="margin:6px 0">Parada de cerradora: ${esc(m?.duracion_horas||2)} h el 13/11. Capacidad: 19,200 → 17,600 cajas; brecha agregada: 400.</p>
    <small>Información académica sintética. Para iniciar el caso, escribe tu solicitud en el chat. Stock, Calidad, logística y aceptación se validan por separado.</small>
  </details>`;
}
function selectorEscenario(){
  const normal=ES_CASO_PC3?'':' selected';
  const pc3=ES_CASO_PC3?' selected':'';
  return `<div class="scenario-nav" aria-label="Elegir modo de demostración"><span>Modo de demostración:</span><a class="scenario-link${normal}" href="/" ${!ES_CASO_PC3?'aria-current="page"':''}>Venta normal</a><a class="scenario-link${pc3}" href="/?escenario=pc3" ${ES_CASO_PC3?'aria-current="page"':''}>Caso PC3 · 360 cajas</a></div>`;
}
function chatView(){
  const mensajes=app.mensajes.length?app.mensajes:welcome();
  const q=quote();
  const qactions=sugerenciasDelMomento(q);
  return `${selectorEscenario()}${head('🤖','Atención Comercial con IA','Conversa, cotiza, negocia y gestiona pedidos.')}
  <div class="toolbar" style="display:flex;justify-content:flex-end;margin-top:-12px;margin-bottom:12px">
    <button class="btn outline" type="button" data-nueva-simulacion title="Nueva sesión independiente con los mismos datos originales">↻ Nueva simulación</button>
  </div>${barCliente()}${panelCasoPC3()}
  <section class="card chat-card" aria-label="Conversación"><div class="chat-messages" id="chatHistory">${mensajes.map(m=>`<div class="chat-row ${m.rol==='cliente'?'client':'agente'}">${m.rol==='cliente'?'':'<div class="avatar">🤖</div>'}<div class="bubble">${esc(m.texto)}<div class="msg-meta">${m.fecha?new Date(m.fecha).toLocaleTimeString('es-PE',{hour:'2-digit',minute:'2-digit',timeZone:'America/Lima'}):''}</div></div></div>`).join('')}</div></section>
  <div class="chat-actions">${qactions.map(([label,mensaje])=>`<button class="quick-btn" data-chat-suggest="${esc(mensaje)}">${esc(label)}</button>`).join('')}</div>
  <form id="chatForm" class="composer"><textarea id="chatMessage" placeholder="Escribe tu mensaje al Agente Comercial Gloria..." aria-label="Mensaje" rows="1" maxlength="1200" required></textarea><button title="Enviar" aria-label="Enviar mensaje" type="submit" ${app.busy?'disabled':''}>➤</button></form>
  <p class="compact-note">${app.ultimoMotor==='groq'?'✓ Groq respondió · Operaciones validadas por el backend':app.ultimoMotor==='respaldo_groq'?`⚠ Groq no respondió (${esc(app.diagnosticoGroq||'causa por revisar')}). Modo guiado activo; revisa Vercel → Logs → /api/chat.`:app.ultimoMotor==='reglas_contextuales'?'✓ Consulta resuelta con reglas ERP/CRM verificadas (sin consumir cuota Groq).':app.ultimoMotor==='reglas_sin_groq'?'Modo guiado: falta configurar GROQ_API_KEY.':app.datos.con_groq?'Groq configurado · Envía un mensaje para verificar la conexión':'Modo guiado: falta GROQ_API_KEY.'}</p>
  ${creditoOferta()?creditoOferta():''}${mostrarResumenFinal(q)?summaryView(q):''}`;
}
function creditoOferta(){const c=app.datos.cliente?.creditos?.find(x=>x.estado==='OFERTADO');if(!c)return '';return `<section class="card panel" style="margin-top:12px"><strong>🏦 Finanzas respondió a tu solicitud</strong><p>Se ha autorizado ofrecer ${money(c.monto_ofrecido)} a ${c.plazo_ofrecido} días; la línea todavía no está activada.</p><div class="chat-actions">${button('Aceptar crédito',`data-responder-credit="${esc(c.id_solicitud)}" data-acepta="true"`,'primary')}${button('Rechazar oferta',`data-responder-credit="${esc(c.id_solicitud)}" data-acepta="false"`,'outline')}</div></section>`;}
function summaryView(q){
  const ap=q.aprobaciones?.find(x=>['PENDIENTE_JEFATURA','OFERTADO'].includes(x.estado));
  const credito=app.datos.cliente?.creditos?.find(x=>x.estado==='OFERTADO');
  const deliveries=q.entregas?.length?q.entregas.map(e=>`${(q.items||[]).find(i=>i.id_producto===e.id_producto)?.producto_nombre||q.producto_nombre}: ${e.cajas} cajas · ${day(e.fecha)}${e.origen==='PRODUCCION'?' (producción pendiente QM)':''}`).join(' / '):'Pendiente de acordar';
  const reservadas=q.estado==='CONFIRMADA'?(q.entregas||[]).filter(e=>e.origen==='STOCK').reduce((n,e)=>n+Number(e.cajas||0),0):0;
  const pendientes=[];if(!q.direccion_confirmada)pendientes.push('confirmar dirección');if(q.forma_pago==='SIN_DEFINIR')pendientes.push('definir pago');if(!q.entrega_aceptada)pendientes.push('aceptar entregas');if(ap)pendientes.push('resolver descuento con Jefatura y cliente');
  const listo=!pendientes.length&&q.estado!=='CONFIRMADA';
  return `<section class="card summary"><div class="summary-header"><h2>▤ Resumen final ${q.estado==='CONFIRMADA'?'del pedido':'de la cotización'} · V${q.version}</h2>${badge(q.estado==='CONFIRMADA'?'CONFIRMADA':pendientes.length?'EN NEGOCIACIÓN':'LISTA PARA CONFIRMAR',q.estado==='CONFIRMADA'||!pendientes.length?'success':'warn')}</div>
  <div class="summary-body">
    <div class="kv"><span class="key">Cliente</span><span class="value">${esc(q.razon_social)}</span></div>
    <div class="kv"><span class="key">Producto</span><span class="value">${esc((q.items||[]).map(x=>`${x.cantidad} cajas · ${x.producto_nombre}`).join(' / ')||q.producto_nombre)}</span></div>
    <div class="kv"><span class="key">Dirección</span><span class="value">${esc((q.direccion||'')+', '+(q.distrito||''))} ${q.direccion_confirmada?'✓':'(por confirmar)'}</span></div>
    <div class="kv"><span class="key">Cantidad</span><span class="value">${q.cantidad} cajas</span></div>
    <div class="kv"><span class="key">${q.estado==='CONFIRMADA'?'Stock reservado para este pedido':'Stock disponible ahora'}</span><span class="value">${q.estado==='CONFIRMADA'?reservadas+' cajas reservadas de lotes liberados':(q.items||[]).map(x=>`${x.producto_nombre}: ${x.disponibilidad?.disponibles??0} cajas`).join(' / ')}</span></div>
    ${q.estado==='CONFIRMADA'?`<div class="kv"><span class="key">Stock libre tras la reserva</span><span class="value">${(q.items||[]).map(x=>`${x.producto_nombre}: ${x.disponibilidad?.disponibles??0}`).join(' / ')} cajas libres para otros pedidos</span></div>`:''}
    <div class="kv"><span class="key">Descuento aplicado</span><span class="value">${q.descuento_pct}% ${ap?'(solicitud pendiente)':''}</span></div>
    <div class="kv"><span class="key">Pago</span><span class="value">${esc(q.forma_pago.replaceAll('_',' '))}</span></div>
    <div class="kv"><span class="key">Entrega</span><span class="value">${esc(deliveries)}</span></div>
    <div class="kv"><span class="key">Total con IGV</span><span class="value">${money(q.total)}</span></div>
  </div>
  ${!q.direccion_confirmada?`<div class="notice" style="margin:0 20px 14px"><strong>Confirma la dirección de entrega:</strong><div class="chat-actions"><select id="direccionSeleccionada" aria-label="Dirección de entrega">${(app.datos.cliente?.direcciones||[]).map(dir=>`<option value="${esc(dir.id_direccion)}" ${dir.id_direccion===q.id_direccion?'selected':''}>${esc(dir.direccion+', '+dir.distrito)}</option>`).join('')}</select>${button('Confirmar dirección','data-confirmar-direccion','primary')}</div></div>`:''}
  ${ap?.estado==='OFERTADO'?`<div class="notice" style="margin:0 20px 14px">Jefatura ofrece <strong>${ap.ofrecido_pct}%</strong>. ¿Aceptas el porcentaje?<div class="chat-actions">${button('Aceptar descuento',`data-responder-desc="${esc(ap.id_solicitud)}" data-acepta="true"`,'primary')}${button('Rechazar oferta',`data-responder-desc="${esc(ap.id_solicitud)}" data-acepta="false"`,'outline')}</div></div>`:''}
  ${credito?`<div class="notice" style="margin:0 20px 14px">Finanzas ofrece ${money(credito.monto_ofrecido)} a ${credito.plazo_ofrecido} días.${button('Aceptar crédito',`data-responder-credit="${esc(credito.id_solicitud)}" data-acepta="true"`,'primary')} ${button('Rechazar',`data-responder-credit="${esc(credito.id_solicitud)}" data-acepta="false"`,'outline')}</div>`:''}
  ${pendientes.length&&q.estado!=='CONFIRMADA'?`<div class="notice warn" style="margin:0 20px 14px">Antes de confirmar: ${esc(pendientes.join(' · '))}.</div>`:''}
  <div class="summary-footer">
   ${q.estado!=='CONFIRMADA'?`${button('Modificar cotización','data-fast="modificar"','outline')} ${!q.entrega_aceptada&&q.entregas?.length?button('Aceptar entregas','data-aceptar-entrega="true"','secondary'):''} ${button('Confirmar pedido','data-confirmar="true" '+(listo?'':'disabled'),'primary')}`:badge('Pedido registrado','success')}
  </div></section>`;
}
function clientesView(){const c=app.datos.cliente;return `${head('♧','Clientes','Solo empresas mayoristas y distribuidoras.')}
  <div class="toolbar">${button('+ Registrar nuevo cliente','data-fast="nuevo_cliente"','primary')} ${button('Solicitar crédito a Finanzas','data-fast="credito"','secondary')}</div>
  <div class="cards">${app.datos.clientes.map(x=>`<article class="card item-card"><div class="staff-meta"><h3>${esc(x.razon_social)}</h3>${badge(x.segmento,'neutral')}</div><p>RUC demo: ${esc(x.ruc)}<br/>Celular: ${esc(x.celular)}<br/>Correo: ${esc(x.correo)}</p><div class="smallinfo">Crédito: <strong>${money(x.linea_credito)}</strong> · ${x.plazo_credito_dias} días</div><div class="card-actions">${button('Seleccionar cliente',`data-cliente="${esc(x.id_cliente)}"`,'secondary')}</div></article>`).join('')}</div>
  ${c?`<h2 class="section-title">Datos registrados de ${esc(c.cliente.razon_social)}</h2><div class="grid2"><div class="card panel"><h2>Contactos</h2>${c.contactos.map(x=>`<p><strong>${esc(x.nombre)}</strong> · ${esc(x.cargo)}<br/>${esc(x.celular)} · ${esc(x.correo)}</p>`).join('')}</div><div class="card panel"><h2>Direcciones</h2>${c.direcciones.map(x=>`<p><strong>${esc(x.distrito)}</strong> · ${esc(x.direccion)}<br/>${esc(x.referencia)}</p>`).join('')}</div></div>`:''}
  <p class="footnote">Los RUC, correos y teléfonos precargados son datos sintéticos. Un cliente nuevo empieza sin crédito y solicita evaluación opcional.</p>`;}
function productosView(){return `${head('▣','Catálogo de productos','Solo leches Gloria · Imágenes ilustrativas del prototipo.')}<div class="cards">${app.datos.productos.map(p=>`<article class="card item-card"><img class="product-img" src="${esc(p.imagen)}" alt="Ilustración de ${esc(p.nombre)}"/><h3>${esc(p.nombre)}</h3><p>${esc(p.presentacion)} · SKU ${esc(p.sku)}</p><div class="smallinfo">Precio lista sin IGV: <strong>${money(p.precio)} / caja</strong></div><div class="card-actions">${button(quote()&&quote().estado!=='CONFIRMADA'?'Añadir a la cotización':'Cotizar producto',`data-producto-cotizar="${esc(p.id_producto)}"`,'primary')}</div></article>`).join('')}</div>`;}
function cotizacionesView(){const arr=app.datos.cliente?.cotizaciones||[];return `${head('▤','Cotizaciones','Versiones y estados de negociación del cliente seleccionado.')}${barCliente()}<div class="toolbar">${button('+ Nueva cotización','data-fast="cotizar"','primary')}</div>${arr.length?`<div class="table-wrap"><table class="data-table"><thead><tr><th>Creada</th><th>Versión</th><th>Producto</th><th>Cajas</th><th>Descuento</th><th>Total</th><th>Estado</th><th></th></tr></thead><tbody>${arr.map(q=>`<tr><td>${day(q.fecha_emision)}</td><td>V${q.version}</td><td>${esc(q.producto_nombre)}</td><td>${q.cantidad}</td><td>${q.descuento_pct}%</td><td>${money(q.total)}</td><td>${badge(q.estado,q.estado==='CONFIRMADA'?'success':'warn')}</td><td>${button('Continuar',`data-abrir-cotizacion="${esc(q.id_cotizacion)}"`,'secondary')}</td></tr>`).join('')}</tbody></table></div>`:'<div class="card empty">Aún no hay cotizaciones para este cliente.</div>'}`;}
function pedidosView(){const arr=app.datos.cliente?.pedidos||[];return `${head('▧','Pedidos','Solo se crean después de aprobaciones y aceptación del cliente.')}${barCliente()}${arr.length?`<div class="table-wrap"><table class="data-table"><thead><tr><th>Fecha</th><th>Pedido</th><th>Estado</th><th>Total</th><th>Forma de pago</th><th>Entregas</th></tr></thead><tbody>${arr.map(p=>`<tr><td>${day(p.creado_en)}</td><td>${esc(p.id_pedido.slice(0,8).toUpperCase())}</td><td>${badge(p.estado,p.estado==='PROGRAMADO_CONDICIONAL'?'warn':'success')}</td><td>${money(p.total)}</td><td>${esc(p.forma_pago)}</td><td>${p.entregas.map(e=>`${e.cajas} cajas (${day(e.fecha)})`).join(' / ')}</td></tr>`).join('')}</tbody></table></div>`:'<div class="card empty">Aún no hay pedidos confirmados.</div>'}<div class="notice" style="margin-top:14px">Un pedido con producción programada se registra como <b>condicional</b> hasta la liberación de Calidad y la validación logística.</div>`;}
function stockView(){const l=app.datos.lotes||[];return `${head('◫','Stock y lotes','El ERP considera disponibles solo los lotes liberados por Calidad y no reservados.')}
  <div class="table-wrap"><table class="data-table"><thead><tr><th>Lote</th><th>Producto</th><th>Almacén</th><th>Cajas físicas</th><th>Calidad</th><th>Vencimiento</th></tr></thead><tbody>${l.map(x=>`<tr><td>${esc(x.id_lote)}</td><td>${esc(x.producto)}</td><td>${esc(x.almacen)}</td><td>${x.cajas}</td><td>${badge(x.calidad,x.calidad==='LIBERADO'?'success':'warn')}</td><td>${day(x.fecha_vencimiento)}</td></tr>`).join('')}</tbody></table></div><div class="notice" style="margin-top:14px">Ejemplo central: UHT tiene 250 cajas liberadas y otras 40 en inspección que <strong>NO</strong> se cuentan en la disponibilidad comercial. Las reservas de pedidos confirmados también descuentan stock.</div>`;}
function produccionView(){const l=app.datos.planes||[];return `${head('▥','Plan de producción (PP-PI)','El agente consulta esta tabla al detectar un faltante de stock.')}
  <div class="table-wrap"><table class="data-table"><thead><tr><th>Referencia PP-PI</th><th>Producto</th><th>Cajas</th><th>Producción</th><th>Disponible estimado</th><th>Estado</th></tr></thead><tbody>${l.map(x=>`<tr><td>${esc(x.referencia_pp_pi)}</td><td>${esc(x.producto)}</td><td>${x.cajas}</td><td>${day(x.fecha_produccion)}</td><td>${day(x.fecha_disponibilidad)}</td><td>${badge(x.estado,'warn')}</td></tr>`).join('')}</tbody></table></div><div class="notice warn" style="margin-top:14px">Una fecha de producción NO significa que el producto ya está liberado ni que se puede prometer una entrega. El agente ofrece alternativas tentativas y revalida al confirmar.</div>`;}
function staffView(rol){const fin=rol==='finanzas',pin=app.pins[rol],arr=app.staff[rol];return `${head(fin?'▤':'♙',fin?'Área de Finanzas':'Jefatura Comercial',fin?'Evaluación humana de líneas de crédito.':'Descuentos especiales mayores al 5 % y hasta 12 %, sujetos a margen mínimo.')}
  <div class="notice">${fin?'Finanzas puede aprobar una línea, ofrecer un monto menor o rechazarla. El cliente debe aceptar antes de que se active el crédito.':'Jefatura puede aprobar el porcentaje, ofrecer uno menor o rechazarlo; el descuento nunca se aplica sin aceptación del cliente.'}</div>
  <div class="card panel" style="margin-top:13px;max-width:550px"><h2>Acceso del área</h2><p>Este panel usa un PIN propio de la demostración. No es autenticación empresarial.</p><form class="form-grid" id="staffPinForm" data-rol="${rol}"><label class="field">PIN de ${fin?'Finanzas':'Jefatura'}<input type="password" name="pin" required value="${esc(pin)}" autocomplete="off" /></label><div class="field" style="justify-content:end"><button class="btn" type="submit">Ver solicitudes</button></div></form></div>
  <h2 class="section-title">Solicitudes recibidas</h2>
  ${!pin?'<div class="card empty">Introduce el PIN para revisar solicitudes y aprobarlas.</div>':!arr.length?'<div class="card empty">No hay solicitudes cargadas o pendientes. Pulsa «Ver solicitudes» para actualizar.</div>':arr.map(s=>renderSolicitud(s,rol)).join('')}`;}
function renderSolicitud(s,rol){const fin=rol==='finanzas';const pending=fin?s.estado==='PENDIENTE_FINANZAS':s.estado==='PENDIENTE_JEFATURA';return `<article class="card staff-card" data-staff-card="${esc(s.id_solicitud)}"><div class="staff-meta"><strong>${esc(s.razon_social)}</strong>${badge(s.estado,pending?'warn':s.estado==='OFERTADO'||s.estado==='ACEPTADA_CLIENTE'?'success':'neutral')}</div>
  <p>${fin?`Solicitó crédito: <strong>${money(s.monto_solicitado)}</strong> · ${s.plazo_solicitado} días. Línea actual: ${money(s.linea_credito)}.`:`Descuento solicitado: <strong>${s.solicitado_pct}%</strong> · ${esc(s.producto_nombre)} · ${s.cantidad} cajas. Margen mínimo: ${s.margen_minimo}%.`}</p>
  ${pending?`<div class="staff-actions">${fin?`<label class="field">Monto a ofrecer<input data-value="monto" type="number" step="0.01" min="1" value="${s.monto_solicitado}"/></label><label class="field">Plazo días<input data-value="plazo" type="number" min="1" max="120" value="${s.plazo_solicitado}"/></label>`:`<label class="field">% a ofrecer (máx. 12)<input data-value="pct" type="number" min="0" max="12" step="0.5" value="${s.solicitado_pct}"/></label>`}<label class="field comment">Observación<input data-value="comentario" maxlength="500" placeholder="Motivo / evidencia"/></label>${button('Aprobar',`data-staff-decision="APROBAR" data-id="${esc(s.id_solicitud)}" data-rol="${rol}"`,'primary')}${button('Ofrecer otro monto / %',`data-staff-decision="CONTRAOFERTAR" data-id="${esc(s.id_solicitud)}" data-rol="${rol}"`,'secondary')}${button('Rechazar',`data-staff-decision="RECHAZAR" data-id="${esc(s.id_solicitud)}" data-rol="${rol}"`,'danger')}</div>`:`<p><strong>Decisión:</strong> ${esc(s.estado)}${s.monto_ofrecido?' · '+money(s.monto_ofrecido):''}${s.ofrecido_pct!=null?' · '+s.ofrecido_pct+'%':''}${s.comentario?' · '+esc(s.comentario):''}</p>`}</article>`;}
function modal(titulo,cuerpo,botones=''){const dlg=$('#modal');$('#modalInner').innerHTML=`<div class="modal-head"><h2>${esc(titulo)}</h2><button class="close-x" data-close aria-label="Cerrar">×</button></div><div class="modal-body">${cuerpo}</div>${botones?`<div class="modal-foot">${botones}</div>`:''}`;dlg.showModal();}
function cerrarModal(){const dlg=$('#modal');if(dlg.open)dlg.close();}
function formQuote(idProduct){const products=app.datos.productos;const anadir=!!idProduct&&quote()&&quote().estado!=='CONFIRMADA';modal(anadir?'Añadir producto a la cotización':'Nueva cotización',`<form id="modalQuoteForm" data-anadir="${anadir?'1':'0'}" class="form-grid"><label class="field wide">Producto<select name="producto">${products.map(p=>`<option value="${esc(p.id_producto)}" ${(idProduct||'PRD-001')===p.id_producto?'selected':''}>${esc(p.nombre)} · ${money(p.precio)}/caja</option>`).join('')}</select></label><label class="field wide">Cantidad de cajas<input name="cantidad" type="number" min="1" max="10000" value="300" required /></label><button type="submit" class="btn">Preparar cotización</button></form><p class="footnote">El agente verificará inventario, calidad y planes de producción.</p>`);}
function formModificacion(){const q=quote();if(!q)return toast('Primero crea una cotización.',true);if(q.items?.length>1){toast('Esta cotización tiene varias líneas. Puedes decir en el chat: cambia UHT a 20 cajas o quita leche fresca.',true);return;}modal('Modificar cotización',`<form id="modalEditQuote" class="form-grid"><label class="field wide">Producto<select name="producto">${app.datos.productos.map(p=>`<option value="${esc(p.id_producto)}" ${p.id_producto===q.id_producto?'selected':''}>${esc(p.nombre)}</option>`).join('')}</select></label><label class="field wide">Cantidad de cajas<input name="cantidad" type="number" value="${q.cantidad}" min="1" max="10000" required /></label><button type="submit" class="btn">Guardar nueva versión</button></form><p class="footnote">Cambiar producto o cantidad obliga a revisar las aprobaciones de descuentos y las entregas anteriores.</p>`);}
function formDescuento(){if(!quote())return toast('Primero prepara una cotización.',true);modal('Solicitar descuento',`<form id="modalDiscount" class="form-grid"><label class="field wide">Porcentaje solicitado<input type="number" name="pct" step="0.5" min="0" max="12" value="8" required /></label><div class="notice wide">Hasta 5 %: agente, si se cumple margen. Más de 5 % y hasta 12 %: Jefatura Comercial; puede aprobar menos de lo solicitado.</div><button class="btn" type="submit">Presentar solicitud</button></form>`);}
function formPago(){const q=quote();if(!q)return toast('Primero prepara una cotización.',true);modal('Condiciones de pago',`<p>Selecciona la modalidad de pago para ${money(q.total)}.</p><div class="chat-actions" style="padding-top:0">${button('Contado','data-pago="CONTADO"','primary')}${button('Crédito aprobado','data-pago="CREDITO"','secondary')}${button('Anticipo 40 % + saldo','data-pago="ANTICIPO"','secondary')}</div><p class="footnote">El anticipo es una política académica simulada. No registra un pago real.</p>`);}
function formEntrega(){const q=quote();if(!q)return toast('Primero prepara una cotización.',true);if(q.items?.length>1){modal('Entregas por producto',`<p>Esta cotización incluye ${q.items.length} leches. Las fechas se validan para cada tipo y lote.</p><div class=\"chat-actions\">${button('Entregas por partes','data-quick-entrega=\"DOS_PARTES\"','primary')}${button('Todo junto','data-quick-entrega=\"TODO_DESPUES\"','secondary')}</div><p class=\"footnote\">Puedes negociar fechas precisas por chat.</p>`);return;}const d=q.disponibilidad;const f=d.planes?.[0]?.fecha_disponibilidad;const dp=f?String(f).slice(0,10):'';const hoy=app.datos.fecha_servidor;const manana=new Date(hoy+'T12:00:00Z');manana.setUTCDate(manana.getUTCDate()+1);const f1=ES_CASO_PC3?'2026-11-16':manana.toISOString().slice(0,10);const primero=Math.min(q.cantidad,d.disponibles);const segundo=q.cantidad-primero;
  modal('Proponer entregas y fechas',`<p>Pedido: <strong>${q.cantidad} cajas</strong>. Stock libre: <strong>${d.disponibles}</strong> · Producción prevista: <strong>${d.planificadas}</strong>.</p>
  <div class="chat-actions" style="padding:0 0 15px">${button('250 ahora + faltante después','data-quick-entrega="DOS_PARTES"','primary')}${button('Todo junto después','data-quick-entrega="TODO_DESPUES"','secondary')}</div>
  <div class="notice">O también registra una distribución de fechas propuesta por el cliente. Se verificará contra el stock y PP-PI.</div>
  <form id="modalCustomDelivery" class="form-grid" style="margin-top:14px"><label class="field">Primera entrega (cajas)<input type="number" name="cantidad1" min="1" max="${q.cantidad}" value="${primero}" required /></label><label class="field">Fecha primera entrega<input type="date" name="fecha1" value="${f1}" min="${hoy}" required /></label><label class="field">Segunda entrega (cajas)<input type="number" name="cantidad2" min="0" max="${q.cantidad}" value="${segundo}" required /></label><label class="field">Fecha segunda entrega<input type="date" name="fecha2" value="${dp||f1}" min="${hoy}" required /></label><button type="submit" class="btn">Validar fechas y proponer</button></form><p class="footnote">Las fechas se proponen, no se prometen automáticamente. La liberación QM y la logística son condiciones posteriores.</p>`);}
function formCredito(){const previo=Number(app.datos?.cliente?.cliente?.linea_credito||0);const sugerido=previo>0?previo+5000:3000;modal('Solicitar línea de crédito a Finanzas',`<p>Cliente seleccionado: <strong>${esc(nombreCliente())}</strong>. Línea actual: <strong>${money(previo)}</strong>; el importe solicitado representa la nueva línea total, no un adicional.</p><form id="modalCredit" class="form-grid"><label class="field">Línea total solicitada (S/)<input name="monto" type="number" min="1" step="100" value="${sugerido}" required /></label><label class="field">Plazo (días)<select name="plazo"><option value="15">15 días</option><option value="30" selected>30 días</option><option value="45">45 días</option></select></label><button type="submit" class="btn">Enviar a Finanzas</button></form><p class="footnote">Finanzas puede aprobar, ofrecer un monto menor o rechazar; después responde el cliente.</p>`);}
function formCliente(){modal('Registrar cliente nuevo',`<p>Solo mayoristas o distribuidores. Ejemplo con datos ficticios.</p><form id="modalClient" class="form-grid"><label class="field wide">Razón social<input name="razon_social" required maxlength="120" placeholder="Distribuidora Ejemplo S.A.C."/></label><label class="field">RUC de prueba<input name="ruc" required pattern="[0-9]{11}" maxlength="11" placeholder="20600000004"/></label><label class="field">Segmento<select name="segmento"><option value="MAYORISTA">Mayorista</option><option value="DISTRIBUIDOR">Distribuidor</option></select></label><label class="field">Contacto<input name="contacto" required placeholder="Persona encargada"/></label><label class="field">Celular<input name="celular" required placeholder="900000404"/></label><label class="field wide">Correo<input name="correo" type="email" required placeholder="contacto@ejemplo.invalid"/></label><label class="field wide">Dirección<input name="direccion" required placeholder="Av. Ejemplo 123"/></label><label class="field">Distrito<input name="distrito" required placeholder="Ate"/></label><button class="btn" type="submit">Guardar cliente</button></form>`);}
async function cargarStaff(rol){try{const a=await api('/api/gestion?rol='+rol,{staff:rol});app.staff[rol]=a.solicitudes;render();}catch(err){toast(err.message,true);app.staff[rol]=[];render();}}
async function action(accion,rest={},notify=true){const d=await api('/api/action',{method:'POST',body:{accion,...rest}});const r=d.resultado;if(notify)toast(r.mensaje||'Operación realizada.');if(r.cotizacion?.id_cotizacion)app.cotizacionId=r.cotizacion.id_cotizacion; if(r.id_cotizacion)app.cotizacionId=r.id_cotizacion;await cargar({silencioso:true});return r;}
async function sendChat(){const textarea=$('#chatMessage');const msg=textarea?.value.trim();if(!msg||app.busy)return;
  if(!ES_CASO_PC3 && solicitaCasoPC3(msg)){
    // Mantener la sesión normal y abrir una copia independiente de los datos PC3.
    sessionStorage.setItem('gloria_demo_session_pc3_informe',crypto.randomUUID());
    sessionStorage.setItem(PENDIENTE_MENSAJE_PC3,msg);
    location.assign('/?escenario=pc3');
    return;
  }
  app.busy=true;const history=$('.chat-messages');if(history)history.insertAdjacentHTML('beforeend',`<div class="chat-row client"><div class="bubble">${esc(msg)}</div></div>`);textarea.value='';try{
  const d=await api('/api/chat',{method:'POST',body:{mensaje:msg,id_cliente:app.clienteId,id_conversacion:app.conversacionId,id_cotizacion:app.cotizacionId}});
  app.mensajes=d.mensajes;app.ultimoMotor=d.motor;app.diagnosticoGroq=d.diagnostico_groq||null;app.conversacionId=d.id_conversacion;if(d.cotizacion?.id_cotizacion)app.cotizacionId=d.cotizacion.id_cotizacion;await cargar({silencioso:true});
 }catch(err){toast(err.message,true);app.mensajes.push({rol:'cliente',texto:msg,fecha:new Date().toISOString()});render();}finally{app.busy=false;$('#chatForm button[type="submit"]')?.removeAttribute('disabled');}
}
async function run(fn){if(app.busy)return;app.busy=true;try{await fn();}catch(err){toast(err.message,true);}finally{app.busy=false;$('#chatForm button[type="submit"]')?.removeAttribute('disabled');}}
function enviarDatos(form){return Object.fromEntries(new FormData(form).entries());}
document.addEventListener('change',ev=>{if(ev.target.id==='selectCliente')cambiarCliente(ev.target.value);});
document.addEventListener('submit',e=>{const form=e.target;e.preventDefault();
  if(form.id==='chatForm'){sendChat();return;}
  run(async()=>{
    if(form.id==='demoPinForm'){app.demoPin=form.pin.value;sessionStorage.setItem('demo_pin',app.demoPin);await cargar();return;}
    if(form.id==='staffPinForm'){const rol=form.dataset.rol;app.pins[rol]=form.pin.value;sessionStorage.setItem(`${rol}_pin`,form.pin.value);await cargarStaff(rol);return;}
    if(form.id==='modalQuoteForm'){const x=enviarDatos(form);const actual=quote();const anadir=form.dataset.anadir==='1'&&actual&&actual.estado!=='CONFIRMADA';const r=anadir?await action('agregar_producto',{id_cotizacion:actual.id_cotizacion,id_producto:x.producto,cantidad:Number(x.cantidad)}):await action('crear_cotizacion',{id_cliente:app.clienteId,id_producto:x.producto,cantidad:Number(x.cantidad)});app.cotizacionId=r.id_cotizacion;app.view='chat';cerrarModal();await cargar();return;}
    if(form.id==='modalEditQuote'){const x=enviarDatos(form);await action('modificar_cotizacion',{id_cotizacion:app.cotizacionId,cambios:{id_producto:x.producto,cantidad:Number(x.cantidad)}});cerrarModal();return;}
    if(form.id==='modalDiscount'){await action('solicitar_descuento',{id_cotizacion:app.cotizacionId,porcentaje:Number(form.pct.value)});cerrarModal();return;}
    if(form.id==='modalCustomDelivery'){const x=enviarDatos(form);const partes=[{cajas:Number(x.cantidad1),fecha:x.fecha1}];if(Number(x.cantidad2)>0)partes.push({cajas:Number(x.cantidad2),fecha:x.fecha2});await action('proponer_entrega',{id_cotizacion:app.cotizacionId,datos:{modo:'PERSONALIZADA',partes}});cerrarModal();return;}
    if(form.id==='modalCredit'){await action('solicitar_credito',{id_cliente:app.clienteId,monto:Number(form.monto.value),plazo_dias:Number(form.plazo.value)});cerrarModal();return;}
    if(form.id==='modalClient'){const r=await action('nuevo_cliente',{datos:enviarDatos(form)});cerrarModal();cambiarCliente(r.cliente.id_cliente);toast('Nuevo cliente registrado. Puede solicitar crédito opcionalmente desde Clientes.');return;}
  });
});
document.addEventListener('keydown',e=>{if(e.target.id==='chatMessage'&&e.key==='Enter'&&!e.shiftKey){e.preventDefault();e.target.closest('form')?.requestSubmit();}});
document.addEventListener('click',e=>{const el=e.target.closest('button');if(!el||el.disabled)return;
  if(el.dataset.nuevaSimulacion!==undefined){
    if(!confirm('¿Iniciar otra simulación limpia? Se conservarán los datos originales de Gloria.'))return;
    app.sesionId=nuevaSesionId();
    app.view='chat';app.clienteId='CLI-LA-001';app.cotizacionId=null;app.conversacionId=null;
    app.mensajes=[];app.datos=null;app.staff={finanzas:[],jefatura:[]};app.ultimoMotor=null;app.diagnosticoGroq=null;
    return cargar();
  }
  if(el.dataset.close!==undefined)return cerrarModal();
  if(el.dataset.top!==undefined)return elegirVista(el.dataset.top);
  if(el.dataset.view!==undefined)return elegirVista(el.dataset.view);
  if(el.dataset.chatSuggest!==undefined){const input=$('#chatMessage');if(input){input.value=el.dataset.chatSuggest;sendChat();}return;}
  if(el.dataset.cliente!==undefined)return cambiarCliente(el.dataset.cliente);
  if(el.dataset.productoCotizar!==undefined)return formQuote(el.dataset.productoCotizar);
  if(el.dataset.abrirCotizacion!==undefined){app.cotizacionId=el.dataset.abrirCotizacion;app.view='chat';return cargar();}
  if(el.dataset.fast!==undefined){const k=el.dataset.fast;return ({catalogo:()=>elegirVista('productos'),cotizar:()=>formQuote(),nuevo_cliente:formCliente,credito:formCredito,modificar:formModificacion,descuento:formDescuento,pago:formPago,entrega:formEntrega})[k]?.();}
  if(el.dataset.pago!==undefined)return run(async()=>{await action('definir_pago',{id_cotizacion:app.cotizacionId,modalidad:el.dataset.pago});cerrarModal();});
  if(el.dataset.quickEntrega!==undefined)return run(async()=>{await action('proponer_entrega',{id_cotizacion:app.cotizacionId,datos:{modo:el.dataset.quickEntrega}});cerrarModal();});
  if(el.dataset.confirmarDireccion!==undefined)return run(()=>action('confirmar_direccion',{id_cotizacion:app.cotizacionId,id_direccion:$('#direccionSeleccionada')?.value}));
  if(el.dataset.aceptarEntrega!==undefined)return run(()=>action('aceptar_entrega',{id_cotizacion:app.cotizacionId,aceptar:true}));
  if(el.dataset.confirmar!==undefined)return run(()=>action('confirmar_pedido',{id_cotizacion:app.cotizacionId}));
  if(el.dataset.responderDesc!==undefined)return run(()=>action('responder_descuento',{id_solicitud:el.dataset.responderDesc,aceptar:el.dataset.acepta==='true'}));
  if(el.dataset.responderCredit!==undefined)return run(()=>action('responder_credito',{id_solicitud:el.dataset.responderCredit,aceptar:el.dataset.acepta==='true'}));
  if(el.dataset.staffDecision!==undefined)return run(async()=>{const rol=el.dataset.rol,c=el.closest('[data-staff-card]');const val=key=>c.querySelector(`[data-value="${key}"]`)?.value;const body={rol,id_solicitud:el.dataset.id,decision:el.dataset.staffDecision,comentario:val('comentario')||''};if(rol==='finanzas'){body.monto=Number(val('monto'));body.plazo_dias=Number(val('plazo'));}else body.porcentaje=Number(val('pct'));const r=await api('/api/gestion',{method:'POST',staff:rol,body});toast(r.resultado.mensaje);await cargarStaff(rol);await cargar({silencioso:true});});
});
async function iniciarAplicacion(){
  await cargar();
  // Tras entrar al caso desde el chat normal, enviar el mensaje que lo activó.
  if(ES_CASO_PC3 && app.datos){
    const pendiente=sessionStorage.getItem(PENDIENTE_MENSAJE_PC3);
    if(pendiente){
      sessionStorage.removeItem(PENDIENTE_MENSAJE_PC3);
      const input=$('#chatMessage');
      if(input){input.value=pendiente;await sendChat();}
    }
  }
}
iniciarAplicacion();
