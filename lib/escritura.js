// Los clientes escriben rápido y por celular: «kiero lech fesca», «nesecito 20 cajs», «xfa».
// Esta capa convierte esas formas a español estándar ANTES de interpretar el mensaje, para que las reglas
// (y el modelo de IA) trabajen con palabras conocidas. Solo corrige formas habituales; no inventa intenciones.
const PALABRAS={
  kiero:'quiero',kero:'quiero',quero:'quiero',qiero:'quiero',kisiera:'quisiera',qisiera:'quisiera',
  nesecito:'necesito',nececito:'necesito',nesesito:'necesito',necsito:'necesito',nesito:'necesito',necesito:'necesito',
  cajs:'cajas',cjas:'cajas',kajas:'cajas',cajaz:'cajas',cjs:'cajas',cj:'cajas',cajitas:'cajas',cajita:'caja',
  lech:'leche',lehe:'leche',leshe:'leche',lecee:'leche',leceh:'leche',lechee:'leche',leche:'leche',
  fesca:'fresca',frezka:'fresca',frezca:'fresca',fresaca:'fresca',freska:'fresca',frsca:'fresca',fresqa:'fresca',freca:'fresca',
  evaporda:'evaporada',evapora:'evaporada',evaporrada:'evaporada',evapordo:'evaporada',evaporadas:'evaporada',
  uth:'uht',uhd:'uht',uhtt:'uht',
  q:'que',xq:'porque',pq:'porque',pa:'para',xfa:'por favor',xfavor:'por favor',porfa:'por favor',pfv:'por favor',plis:'por favor',
  sgte:'siguiente',sgtes:'siguientes',sig:'siguiente',prox:'proxima',
  tmb:'tambien',tbn:'tambien',tmbn:'tambien',dsp:'despues',xk:'porque',
  weno:'bueno',wenas:'buenas',ola:'hola',holi:'hola',holaa:'hola',
  acepto:'acepto',aseptar:'aceptar',aceptp:'acepto',confirmo:'confirmo',
  descuneto:'descuento',desc:'descuento',dscto:'descuento',dcto:'descuento',
  preceio:'precio',presio:'precio',presios:'precios',
  entrga:'entrega',entreg:'entrega',entregar:'entregar',fehca:'fecha',
  pagr:'pagar',contdo:'contado',contado:'contado'
};
export function corregirEscritura(texto=''){
  let t=String(texto);
  // «holaaa» -> «hola»; solo letras (los números como 1000 no se tocan).
  t=t.replace(/([a-záéíóúñ])\1{2,}/gi,'$1');
  // «d» suelta entre palabras es «de»: «30 cajas d leche».
  t=t.replace(/(\S)\s+d\s+(?=[a-záéíóúñ])/gi,'$1 de ');
  t=t.replace(/\bleche(?=evaporad|fresc|uht|enter)/gi,'leche ');
  return t.replace(/[A-Za-zñÑ]+/g,w=>{
    const m=PALABRAS[w.toLowerCase()];
    if(!m||m===w.toLowerCase())return w;
    return w===w.toUpperCase()&&w.length>2?m.toUpperCase():m;
  });
}
