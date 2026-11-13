# Agente Comercial Gloria — FIX de venta consultiva, inventario y fechas

**Destino:** repositorio existente `sebascarl28/Agente-Comercial-Gloria`, rama `main`.
**No crea otro proyecto. No modifica Supabase SQL. No requiere claves nuevas.**

## Archivos que hay que subir

Estos son los únicos archivos a reemplazar o añadir (7 archivos):

- `api/chat.js` — **reemplazar**.
- `lib/ai.js` — **reemplazar** (orientación comercial para Groq).
- `lib/dialogo.js` — **añadir** (nueva memoria estructurada y comprensión de frases).
- `lib/rules.js` — **reemplazar** (fecha correcta cuando hay varios planes de producción).
- `lib/service.js` — **reemplazar** (entrega parcial voluntaria).
- `tests/dialogo.test.js` — **añadir**.
- `tests/negociacion.test.js` — **reemplazar** (actualiza una verificación de la arquitectura).

**¡Importante!** No elimines otros archivos. No subas el ZIP cerrado ni una carpeta extra. En GitHub: `Add file → Upload files`; selecciona las carpetas `api`, `lib` y `tests` de la carpeta extraída. Confirma que se conserven las rutas de arriba. Guarda con `Commit changes`. Vercel desplegará la rama `main` automáticamente.

Si GitHub no permite sobreescribir directamente, usa GitHub Desktop o edita los archivos desde la web; no borres las carpetas completas. Verifica que `lib/dialogo.js` esté presente en el mismo nivel que `lib/ai.js`.

## Comportamiento corregido

- Preguntar "¿Cuánto stock tienes de leche fresca?" devuelve el stock liberado y el plan; NO exige indicar cajas antes de responder.
- "Quiero todo el stock disponible" toma las **cajas liberadas** del producto ya seleccionado, sin contar producción no liberada.
- "300 cajas" conserva el último tipo de leche elegido, aunque haya llegado en otro mensaje.
- Detecta la pregunta "¿Tienes stock para 300 cajas?" sin abrir una cotización hasta que el cliente lo acepte.
- Propone cantidades, fechas posibles y alternativas condicionadas a Calidad y logística. Nunca promete una cantidad que no tiene cobertura.
- "sí, entrega parcial" acepta la negociación contextual: si solo se pueden cubrir 150 de 300, **pregunta antes de ajustar la cantidad** y no confirma pedido automáticamente.
- Permite entregas parciales por preferencia aun si hay stock suficiente y reconoce repartos como "100 primero y 100 después".
- Reconoce fechas `17/11`, `17 de noviembre`, `el 17` y "dentro de una semana".
- Permite decir "a crédito" y proponer una dirección nueva en el mismo mensaje. La dirección necesita confirmación explícita antes de guardarse.
- Conserva los PIN de Finanzas/Jefatura, aprobación de descuentos, simulaciones independientes y resumen final solo tras completar la negociación.

## Pruebas manuales recomendadas

**Primero**, espera en Vercel a que el último deployment `main` quede `Ready`/`Production`. Abre `https://agente-comercial-gloria.vercel.app` y pulsa **Nueva simulación**.

**Caso 1 — Stock:**
1. `Hola, ¿cuánto stock tienes de leche fresca?` → 90 cajas liberadas; 60 previstas desde 17/11/2026 (si la fecha de la base sigue siendo la inicial).
2. `Quiero llevarme todo el stock` → cotización por 90 cajas, sin reservar inventario.

**Caso 2 — Excepción sin cobertura:**
1. Nueva simulación: `Quiero 300 cajas de leche fresca` → 90 liberadas, 60 previstas, 150 sin cobertura programada.
2. `Sí, acepto cotizar las 150` → debe **cambiar la cotización** a 150 y proponer 90 + 60; la parte de producción queda condicionada.
3. `Acepto las dos entregas` → registra la aceptación de la propuesta, no el pedido.

**Caso 3 — Excepción recuperable:**
1. Nueva simulación: `Necesito 300 cajas de leche UHT` → propone 250 primero y 50 previstas desde 19/11/2026.
2. `Las quiero en dos partes` → propuesta de 250 + 50; espera aceptación.
3. `Sí, acepto la entrega` → avanza a pago.

**Caso 4 — Parcial voluntaria:**
1. Nueva simulación: `Necesito 200 cajas de leche evaporada` (300 liberadas).
2. `Quiero 100 cajas primero y 100 después` → dos despachos propuestos, no uno.

## Seguridad / validación

La lógica comercial y las modificaciones a la BD se realizan del lado del servidor. Groq interpreta la conversación, no autoriza descuentos, créditos o stock. La simulación sigue aislada mediante `enSimulacion`. `estado_chat` se guarda dentro del JSONB ya existente de `conversaciones.mensajes`, por lo que **no hay que ejecutar SQL adicional**.

Las pruebas de Node son locales, **sin conexión real** a Groq, Supabase ni Vercel. Verifica estos servicios después de desplegar. No compartas PIN, `DATABASE_URL` ni claves API.
