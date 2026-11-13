export function respuesta(res, status, obj) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(obj));
}
export function errorJson(res, err) {
  const code = Number(err?.status) || 500;
  if (code >= 500) console.error(err);
  respuesta(res,code,{ok:false,error:code >= 500 ? 'Error del servidor. Revisa los registros de Vercel.' : err.message});
}
export function falla(mensaje, status=400) { const e = new Error(mensaje);e.status=status;throw e; }
export function revisarAcceso(req) {
  if (process.env.DEMO_ACCESS_PIN && req.headers['x-demo-pin'] !== process.env.DEMO_ACCESS_PIN) falla('Necesitas la clave de acceso de la demostración.',401);
}
export function revisarRol(req, rol) {
  const clave = rol === 'finanzas' ? process.env.FINANZAS_PIN : process.env.JEFATURA_PIN;
  if (!clave || clave.startsWith('cambiar_')) falla(`Configura ${rol === 'finanzas' ? 'FINANZAS_PIN' : 'JEFATURA_PIN'} en Vercel.`,503);
  if (req.headers['x-staff-pin'] !== clave) falla('PIN incorrecto para el área seleccionada.',403);
}
export function metodo(req, permitido) { if (!permitido.includes(req.method)) falla('Método no permitido.',405); }
export function obligatorio(cadena, nombre, max=300) {
  if (typeof cadena !== 'string' || !cadena.trim() || cadena.trim().length>max) falla(`${nombre} es obligatorio (máximo ${max} caracteres).`);
  return cadena.trim();
}
