# Casos de prueba del Agente Comercial Gloria (PC3)

## Caso 1 — Normal (sin producción)

- Cliente: La Alameda; leche evaporada; 100 cajas.
- El ERP debe encontrar 300 cajas liberadas (antes de otros pedidos).
- El cliente puede escoger entrega total o dos entregas voluntarias, por ejemplo 40 + 60, en fechas válidas.
- Descuento 5 % solamente si se cumple el margen mínimo; opción de contado.
- El resumen se muestra **después de crear la cotización**; no desde el saludo.
- Confirmación: generar pedido y registros de entregas y pago pendientes.

## Caso 2 — Excepción de stock y fechas (principal)

- La Alameda pide 300 cajas **UHT**.
- ERP muestra 250 cajas liberadas; 40 en inspección no se cuentan.
- El plan PP-PI contiene 50 cajas adicionales con producción a los 5 días desde la carga del SQL y disponibilidad estimada al día siguiente.
- El agente propone 250 antes y 50 después, o las 300 juntas en fecha posterior.
- El cliente puede proponer otra fecha; una fecha anticipada imposible produce una negativa fundada, no una promesa falsa.
- Con producción futura, el pedido se marca `PROGRAMADO_CONDICIONAL`; no se confunde planificación con liberación QM.

## Caso 3 — Descuento 8 % y aprobación parcial

- La Alameda solicita descuento 8 % tras cotizar UHT 300.
- Agente no lo aprueba por sí solo: solicita Jefatura Comercial.
- Jefatura puede aprobar 8 %, ofrecer 7 % o rechazar. **Máximo 12 % y margen mínimo del SKU**.
- El cliente acepta o rechaza lo ofrecido. Hasta entonces, no puede confirmar pedido definitivo.
- Si cambia producto/cantidad, el backend invalida autorizaciones anteriores que dependían de esos importes.

## Caso 4 — Crédito de cliente nuevo

- `Clientes → Nuevo cliente`: registrar solo mayorista o distribuidor, con contacto y dirección.
- Crédito inicial **S/ 0**.
- Solicitar S/ 3 000 a 30 días.
- Finanzas ofrece S/ 1 500 a 30 días (aprobación parcial).
- El agente muestra la propuesta; el cliente decide aceptar o rechazar.
- Solo la aceptación actualiza `linea_credito` en CLIENTES.

## Caso 5 — Más crédito del disponible

- Cotizar una compra cuyo total supere el saldo de la línea de crédito.
- Seleccionar pago con crédito debe fallar y solicitar decisión de Finanzas o cambio de modalidad.
- Una aprobación de crédito no reemplaza la autorización de descuentos de Jefatura.

## Caso 6 — Protección de datos / roles (demo)

- Con `FINANZAS_PIN` no se pueden aprobar descuentos de Jefatura.
- Con `JEFATURA_PIN` no se pueden aprobar créditos.
- Los PIN y las credenciales de Groq/BD no deben aparecer en el código público ni en JSON de bootstrap.

**Precaución:** las pruebas de confirmación consumen stock en la base de demostración (se crean reservas). Prueba primero la excepción UHT o utiliza evaporada en el caso normal para no afectar las 250 cajas disponibles en UHT.
