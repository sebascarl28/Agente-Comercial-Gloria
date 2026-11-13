import test from 'node:test';
import assert from 'node:assert/strict';
import {pideOrientacion,recomendacionProducto,quierePedirLeche} from '../lib/orientacion.js';
import {intencionVerificableSinLLM} from '../lib/ai.js';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

test('Recomendación usa stock real y pregunta sobre demanda sin adivinar cantidades',()=>{
 assert.equal(pideOrientacion('¿qué me recomiendas?'),true);
 const r=recomendacionProducto('PRD-003',{disponibles:90});
 assert.match(r,/90 cajas liberadas/);assert.match(r,/cu[aá]ntas cajas sueles vender/);
 assert.doesNotMatch(r,/te recomiendo comprar 90/);
 assert.match(recomendacionProducto(null,null),/UHT entera, evaporada o fresca/);
 assert.match(recomendacionProducto('PRD-003',null),/stock por verificar/);
});
test('La petición general de leche y la recomendación se resuelven aun sin Groq',()=>{
 assert.equal(quierePedirLeche('quiero pedir leche'),true);
 assert.equal(intencionVerificableSinLLM('quiero pedir leche'),true);
 assert.equal(intencionVerificableSinLLM('¿qué me recomiendas?'),true);
 assert.equal(pideOrientacion('¿qué descuento me recomiendas?'),false);
});
test('Botones muestran tipos y cantidades en la etapa correspondiente',()=>{
 const src=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const fn=src.slice(src.indexOf('function sugerenciasDelMomento(q){'),src.indexOf('function panelCasoPC3()'));
 const botones=esperando=>vm.runInNewContext(`(${fn})(null)`,{app:{mensajes:[{rol:'agente',estado_chat:{esperando}}]},mostrarResumenFinal:()=>false});
 assert.deepEqual(Array.from(botones('PEDIR_PRODUCTO'),x=>x[1]),['Leche entera','Leche evaporada','Leche fresca']);
 assert.ok(Array.from(botones('PEDIR_CANTIDAD'),x=>x[1]).includes('30 cajas'));
});
