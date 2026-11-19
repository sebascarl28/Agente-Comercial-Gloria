// Formato de fechas para el cliente: "17 de noviembre" en lugar de 2026-11-17 o 17/11.
const MESES=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
export function fechaLarga(valor){
  const m=String(valor??'').slice(0,10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m?`${Number(m[3])} de ${MESES[Number(m[2])-1]}`:'';
}
