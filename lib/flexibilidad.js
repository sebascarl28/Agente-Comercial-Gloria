// FLEXIBILIDAD DEL MOTOR DE REGLAS
// Principio: las reglas siguen DECIDIENDO y EJECUTANDO (stock, precio, crédito, descuentos, pedido);
// lo que se flexibiliza es cómo se ENTIENDE al cliente:
//   1) Las reglas toleran relleno y fórmulas de cortesía («sí, por favor», «claro que sí», «bueno, ya»).
//   2) Si las reglas no reconocen una aceptación o rechazo, la IA puede proponerlo, pero solo si el estado de la
//      conversación espera una respuesta de ese tipo y el mensaje pasa varias guardas (corto, sin números, sin
//      preguntas ni condiciones). La confirmación final del pedido NUNCA depende de la IA.
// Todo queda trazado: la respuesta del agente registra si se interpretó por reglas o con apoyo de la IA.
import {normalizar,esConfirmacionCorta,esAfirmacion,esNegacion} from './dialogo.js';

// Estados en los que el agente acaba de hacer una pregunta de sí/no.
export const ESTADOS_SI_NO_CON_IA=['ACEPTAR_ENTREGA','ACEPTAR_DESCUENTO','CONFIRMAR_DIRECCION','ACEPTAR_DIRECCION_NUEVA','CAMBIAR_PRODUCTO','CONFIRMAR_TIPO_LECHE','OFRECER_COTIZACION','DESCUENTO_OPCIONAL','CONFIRMAR_PRODUCTOS_INTERPRETADOS'];
// La confirmación del pedido admite relleno («sí, por favor») pero nunca la interpretación de la IA.
export const ESTADOS_SI_NO_SOLO_REGLAS=[...ESTADOS_SI_NO_CON_IA,'CONFIRMAR_PEDIDO'];

const RELLENO_INICIAL=/^(?:(?:ya|pues|bueno|bien|entonces|mmm+|eh+|oye|este)[,.!\s]+)+/;
const RELLENO_FINAL=/[,.!\s]+(?:por favor|por fa vor|porfa|gracias|muchas gracias|nomas|no mas|pues|ya|jeje|jaja|si es posible)[!.\s]*$/;
export function sinRelleno(m=''){
  let t=m;
  for(let i=0;i<3;i++)t=t.replace(RELLENO_INICIAL,'').replace(RELLENO_FINAL,'').trim();
  return t||m;
}
const SI=/^(?:s[ií]+p?|diria que si(?: es correcto)?|claro(?: que s[ií])?|por supuesto|desde luego|adelante|conforme|me parece (?:bien|perfecto|excelente|genial|muy bien)|esta (?:perfecto|genial|excelente|muy bien|bien)|de una|va|asi es|exacto|correcto|perfecto|genial|excelente|todo bien|de acuerdo|ya|ok|okey|okay|oki|dale|vale|listo)(?:[,.!\s]+(?:acepto|confirmo|adelante|dale|perfecto|gracias))?[,.!\s]*$/;
const NO=/^(?:no|nop|no gracias|mejor no|no por ahora|todavia no|aun no|no me parece|no me sirve|no me conviene|rechazo|la rechazo|lo rechazo|no acepto)[,.!\s]*$/;
// La IA no puede decidir un sí/no si el mensaje trae condiciones, preguntas o cifras: ahí pregunta el agente.
const CONDICIONES=/\b(?:pero|aunque|siempre que|solo si|si es|cambiar|cambia|modificar|modifica|otra|otro|diferente|espera|cancelar|descuento|credito|direccion|cuanto|cuando|precio|stock|mas|menos)\b/;

// Devuelve {valor:'SI'|'NO', via:'reglas'|'ia'} o null si no se puede interpretar con seguridad.
export function confirmacionFlexible(texto='',interpretacion={},estado={}){
  const espera=estado.esperando;
  if(!ESTADOS_SI_NO_SOLO_REGLAS.includes(espera))return null;
  const m=sinRelleno(normalizar(texto));
  if(m.length>70||/[\d?¿%]/.test(String(texto)))return null;
  if(espera==='CONFIRMAR_PRODUCTOS_INTERPRETADOS' && /^diria que si(?: es correcto)?[,.!\s]*$/.test(m))return {valor:'SI',via:'reglas'};
  if(CONDICIONES.test(m))return null;
  if(SI.test(m)||esConfirmacionCorta(m)||esAfirmacion(m)&&m.split(/\s+/).length<=3)return {valor:'SI',via:'reglas'};
  if(NO.test(m)||esNegacion(m)&&m.split(/\s+/).length<=3)return {valor:'NO',via:'reglas'};
  // Apoyo de la IA solo en preguntas de sí/no que no son la confirmación final del pedido.
  if(!ESTADOS_SI_NO_CON_IA.includes(espera))return null;
  if(!['deepseek','groq'].includes(interpretacion?.proveedor_ia))return null;
  if(interpretacion.accion==='aceptar')return {valor:'SI',via:'ia'};
  if(interpretacion.accion==='rechazar')return {valor:'NO',via:'ia'};
  return null;
}
