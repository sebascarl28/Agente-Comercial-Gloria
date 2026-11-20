// Formato de fechas para el cliente: "17 de noviembre" en lugar de 2026-11-17 o 17/11.
const MESES=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
// Con `hoy` (AAAA-MM-DD) se añade el año solo cuando la fecha cae en otro año: «5 de enero de 2027».
export function fechaLarga(valor,hoy=null){
  const m=String(valor??'').slice(0,10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(!m)return '';
  const anio=hoy&&String(hoy).slice(0,4)!==m[1]?` de ${m[1]}`:'';
  return `${Number(m[3])} de ${MESES[Number(m[2])-1]}${anio}`;
}
