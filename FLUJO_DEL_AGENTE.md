# Diseño funcional — Agente Comercial Gloria

## Estado inicial de la aplicación

- El usuario abre el **chat** y selecciona **Comercial La Alameda S.A.C.**, cliente registrado.
- El encabezado muestra la fecha del servidor (zona horaria Lima).
- La Alameda tiene S/ 30 000 de línea de crédito existente y 30 días de plazo.
- Los otros dos clientes son B2B (mayoristas o distribuidores) y no están obligados a solicitar crédito.
- El **resumen** no aparece hasta crear una cotización.

## Secuencia comercial

1. **Identificación**. Seleccionar cliente existente o registrar uno nuevo, con contacto y dirección. Confirmar los datos antes de negociar.
2. **Consulta / cotización**. El cliente pregunta por leche, indica producto y cajas. El agente consulta precio y lotes `LIBERADO` descontando reservas vigentes.
3. **Excepción de stock**, solo si aplica. Si solicitan 300 UHT y hay 250, se consulta `plan_produccion` para 50 adicionales, con fecha estimada posterior a producción, pendiente de QM.
4. **Negociación de fechas**. El agente ofrece la primera alternativa y escucha propuestas del cliente: entrega completa posterior, parcial por faltante o parcial voluntaria. Nunca confirma una fecha logística sin validarla.
5. **Negociación de descuento**. Hasta 5 % el agente puede aplicar sujeto al margen. Por encima de 5 % y hasta 12 %, Jefatura Comercial decide aprobar, autorizar un porcentaje menor o rechazar.
6. **Finanzas**, de forma independiente. La Alameda ya tiene crédito; si la compra supera el saldo o solicita nueva línea, Finanzas evalúa. Para un cliente nuevo, la solicitud de crédito es **opcional**, y su línea parte de cero.
7. **Aceptación del cliente**. Ni la oferta parcial de Jefatura ni la oferta parcial de Finanzas se aplican sin aceptación explícita.
8. **Resumen progresivo**. Muestra datos cotizados, fecha propuesta, modalidad y solicitudes pendientes. Si cambian producto o cantidad, invalida aprobaciones especiales previamente asociadas a esa cotización.
9. **Validación final y pedido**. La cotización debe tener pago seleccionado, entregas aceptadas y aprobaciones resueltas. La API revalida stock y crédito en una transacción antes de registrar reservas y pedido. Parte de producción queda en estado condicional.

## Fronteras de autoridad

- **IA/Groq**: comprender mensajes, explicar opciones, solicitar acciones permitidas.
- **Backend comercial**: cálculos, descuentos automáticos permitidos, versiones, reglas de fecha y crédito.
- **ERP simulado**: lotes, QM, PP-PI, reservas, pagos simulados, pedidos.
- **Jefatura Comercial**: decisión sobre descuentos especiales, máximo 12 % y mínimo margen por SKU.
- **Finanzas**: línea de crédito inicial, ampliación, importe y plazo.
- **Cliente**: acepta o rechaza las nuevas ofertas comerciales antes de confirmar.

## Estado y evidencia del caso de excepción

- Pedido: **300 cajas UHT**.
- Stock: **250 disponibles liberadas**; 40 en inspección no pueden incluirse.
- Producción: **50 programadas**, la fecha se obtiene del ERP simulado; no son stock físico ni una promesa de despacho.
- Opciones: **250 primero + 50 después**, o **300 juntas tras la fecha viable**.
- Descuento de ejemplo: **8 %**, Jefatura evalúa y cliente acepta.
- Pago: crédito de La Alameda sujeto a saldo.
- Resultado: `PROGRAMADO_CONDICIONAL`, con trazabilidad en cotización, aprobaciones, pedido y entregas.

## Acciones de API

- `GET /api/bootstrap?cliente_id=...` — catálogo, lotes, planes y estado de cliente/cotización.
- `POST /api/chat` — mensaje natural + memoria de conversación guardada en PostgreSQL.
- `POST /api/action` — crear/modificar cotización, pago, entregas, crédito, aceptación y confirmación.
- `GET /api/gestion?rol=finanzas|jefatura` — bandejas internas, requiere PIN específico.
- `POST /api/gestion` — decisión humana, requiere PIN específico.

**Importante:** prototipo académico, no apto para uso comercial real con personas y dinero verdaderos sin seguridad, auditoría, infraestructura y aprobación institucional adicionales.


## Reglas flexibles: la IA propone, las reglas validan

El agente sigue siendo controlable: **las reglas deciden y ejecutan** (stock, precios, crédito, descuentos, aprobaciones y registro del pedido). Lo que se flexibiliza es cómo se **entiende** al cliente.

1. **Reglas tolerantes.** Un sí o un no admite relleno y cortesía («sí, por favor», «claro que sí», «bueno, ya», «no gracias», «mejor no»), sin depender de la IA.
2. **La IA ayuda a entender lo que las reglas no reconocen**, solo si se cumplen todas estas condiciones:
   - el agente acaba de hacer una pregunta de sí o no (aceptar entrega, descuento, dirección, confirmar producto…);
   - hay un proveedor de IA activo y esa IA interpretó «aceptar» o «rechazar»;
   - el mensaje es corto, sin cifras, preguntas ni condiciones («pero», «solo si», «cambiar»…); en ese caso el agente pregunta de nuevo.
3. **Fechas.** Si las reglas no entienden una fecha («pasando el feriado largo») la IA puede proponerla, pero se valida igual: nunca una fecha pasada, a lo sumo dentro de un año y solo si el mensaje habla de fechas.
4. **Lo que nunca depende de la IA:** la confirmación final del pedido (exige un «sí» explícito después del resumen), los montos, las reservas de stock y la autoridad de aprobación (Jefatura y Finanzas).
5. **Trazabilidad.** Cada respuesta del agente registra en la bitácora si se interpretó solo con reglas («Reglas ERP/CRM verificadas») o con apoyo de la IA («Interpretación de la IA validada por reglas ERP/CRM»).

Código: `lib/flexibilidad.js` (aceptación y rechazo), `lib/dialogo.js` (fechas) y `api/chat.js` (integración). Pruebas: `tests/reglas_flexibles.test.js`.
