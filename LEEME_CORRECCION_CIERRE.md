# Agente Comercial Gloria — Corrección de cierre y consistencia de pedido

Actualización basada en la última versión del repositorio `sebascarl28/Agente-Comercial-Gloria` (rama `main`, posterior a la corrección de stock y fechas). **No incluye ni requiere SQL nuevo.**

## Qué corrige

1. **No reduce cantidades por una respuesta ambigua.** «Sí, una entrega parcial» mantiene las 300 cajas solicitadas. Para reducir a 150, el cliente debe decir explícitamente «reducir a 150 cajas».
2. **Entrega completa reemplaza la parcial anterior.** «Las 150 juntas» se interpreta como una nueva modalidad de entrega. Se construye una propuesta de una sola fecha; al cambiarla se invalida la aceptación anterior y es obligatorio aceptarla de nuevo. La fecha sigue sujeta a producción, Calidad y logística.
3. **Seguimiento del descuento sin repetir solicitudes.** «¿Ya se aceptó mi descuento?» consulta el estado de Jefatura. «Acepto el descuento» aplica la oferta solo cuando Jefatura la marcó `OFERTADO`.
4. **Confirmación final por chat.** Un «sí» corto registra el pedido únicamente si la última respuesta pidió confirmar el pedido y las condiciones verificadas (versión, producto, cantidad, descuentos, pago, dirección y entregas) no cambiaron. También se permite la frase explícita «confirmar pedido», pero si el resumen no se mostró o cambió primero se presenta y solicita confirmación de nuevo.
5. **No toma frases ambiguas por aceptación.** «Ok, quiero ver» no acepta automáticamente entregas o direcciones.
6. **Stock claro después de confirmar.** El resumen distingue cajas del lote liberado reservadas para el pedido del stock que queda disponible para nuevos pedidos. Un saldo libre de cero no significa que la venta no contó con inventario.

## Instalación en GitHub

1. Crea opcionalmente una rama de prueba desde `main` antes de cambiar producción.
2. Extrae el ZIP en Windows. En GitHub ve a `sebascarl28/Agente-Comercial-Gloria` → `Add file` → `Upload files`.
3. Sube **las carpetas `api`, `lib`, `public` y `tests` desde la raíz del ZIP**, sin meterlas dentro de otra carpeta. Se reemplazan solo los archivos incluidos; los demás quedan intactos.
4. Confirma que estas rutas queden en el repositorio:
   - `api/chat.js`
   - `lib/ai.js`
   - `lib/dialogo.js`
   - `lib/negociacion.js`
   - `public/app.js`
   - `tests/dialogo.test.js`
   - `tests/cierre_venta.test.js`
5. Commit sugerido: `fix: cerrar pedidos con condiciones acordadas y consentimiento explícito`.
6. Si subiste a `main`, espera **Ready** en Vercel → Deployments. Si usas una rama, verifica el Preview y luego incorpora a `main`.
7. En la aplicación pulsa **Nueva simulación**; evita evaluar sobre una cotización confirmada de pruebas anteriores.

## Pruebas rápidas

**Escenario A — Reducción no implícita:**
- «Necesito 300 cajas de leche fresca» → 90 liberadas + 60 planificadas + 150 sin cobertura.
- «Sí, prefiero una entrega parcial» → no debe reducir 300 a 150 automáticamente.
- «Reducir a 150 cajas» → ahora sí actualiza la cotización con consentimiento explícito.

**Escenario B — Entregas consistentes:**
- Después de negociar 150 cajas, «prefiero las 150 juntas» → propuesta de 150 en una fecha viable, **no** 90 + 60 en fechas distintas.
- Verifica que la propuesta anterior deje de estar aceptada y que el agente pida aceptar la nueva.

**Escenario C — Jefatura:**
- Solicita 8 %, aprueba u ofrece porcentaje por Jefatura.
- «¿Ya aprobaron mi descuento?» → consulta el estado, sin crear una segunda solicitud.
- «Acepto el descuento» o «sí» justo después de que el agente pregunta si lo acepta → aplica la oferta.

**Escenario D — Cierre:**
- Cuando el resumen final esté listo y el agente pregunte «¿Confirmas el pedido con esas condiciones?», responde «sí» → registra el pedido.
- Si preguntas por el stock entre el resumen y el «sí», el sistema vuelve a pedir confirmación en vez de registrar automáticamente.
- En resumen confirmado verifica «Stock reservado para este pedido» y «Stock libre tras la reserva».

## Validación

`npm test` en la copia completa de trabajo: **47 pruebas aprobadas**. `npm run check`: sintaxis OK. No fue posible verificar la conexión real a la base de datos del usuario ni a Groq desde este entorno. Debe probarse con Vercel y Supabase tras el despliegue. 

Se preservan: sesión independiente por visitante, datos sintéticos, controles de aprobación, tablas SQL y claves existentes. **No subas contraseñas ni claves API a GitHub.**
