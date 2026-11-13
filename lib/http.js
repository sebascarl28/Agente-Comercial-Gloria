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
export function metodo(req, permitido) { if (!permitido.includes(req.method)) falla('Método no permitido.',405); }
export function obligatorio(cadena, nombre, max=300) {
  if (typeof cadena !== 'string' || !cadena.trim() || cadena.trim().length>max) falla(`${nombre} es obligatorio (máximo ${max} caracteres).`);
  return cadena.trim();
}
