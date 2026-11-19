export function respuesta(res, status, obj) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(obj));
}
// Fallas de red o de base de datos que suelen desaparecer al reintentar (pooler de Supabase, arranque en frío).
const CODIGOS_TRANSITORIOS=['ECONNRESET','ETIMEDOUT','ECONNREFUSED','EPIPE','57P01','57P03','53300','08000','08001','08003','08006'];
export function esTransitorio(err){
  const m=String(err?.message||'');
  return CODIGOS_TRANSITORIOS.includes(err?.code)||/timeout exceeded when trying to connect|Connection terminated|connection timeout|read ECONNRESET|Query read timeout/i.test(m);
}
export function errorJson(res, err) {
  let code = Number(err?.status) || 500;
  if (code >= 500) console.error(err);
  let mensaje = code >= 500 ? 'Error del servidor. Revisa los registros de Vercel.' : err.message;
  // Un corte de la base de datos no es un error de la aplicación: se avisa que se puede reintentar.
  if (code === 500 && esTransitorio(err)) {code = 503;mensaje = 'La base de datos no respondió a tiempo. Vuelve a intentarlo en unos segundos.';}
  if (code === 503 || code === 429) res.setHeader('Retry-After','3');
  respuesta(res,code,{ok:false,error:mensaje,reintentable:code === 503 || code === 429});
}
export function falla(mensaje, status=400) { const e = new Error(mensaje);e.status=status;throw e; }
export function metodo(req, permitido) { if (!permitido.includes(req.method)) falla('Método no permitido.',405); }
export function obligatorio(cadena, nombre, max=300) {
  if (typeof cadena !== 'string' || !cadena.trim() || cadena.trim().length>max) falla(`${nombre} es obligatorio (máximo ${max} caracteres).`);
  return cadena.trim();
}
