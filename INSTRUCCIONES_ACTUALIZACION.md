# Agente Comercial Gloria — Corrección de negociación conversacional

## Objetivo

Este ZIP modifica el proyecto **existente** `sebascarl28/Agente-Comercial-Gloria`.

- **Primero** pide producto, cajas y fecha que desea el cliente.
- Consulta stock de lotes liberados y el plan PP-PI si faltan cajas; plantea entregas en partes o juntas con fechas condicionadas.
- Permite aceptar o renegociar entrega, descuento, pago y dirección desde el chat.
- Las preguntas «¿Jefatura ya aprobó?» y «¿cómo va mi cotización?» consultan el estado real de las solicitudes, no generan otra solicitud ni inventan una autorización.
- Una oferta autorizada por Jefatura o Finanzas **requiere aceptación del cliente**.
- La tarjeta de **Resumen final** aparece debajo del chat solo cuando ya se acordaron entrega, pago, dirección y no hay descuento pendiente. La confirmación final sigue requiriendo una acción expresa del cliente y validación del backend.
- Conserva **Nueva simulación** y la separación por sesión de visitante (`X-Demo-Session`, `enSimulacion`).

## 1. Archivos a reemplazar o agregar

Sube el CONTENIDO descomprimido sobre la raíz del repositorio:

| Ruta | Acción |
|---|---|
| `api/chat.js` | Reemplazar |
| `lib/ai.js` | Reemplazar |
| `lib/negociacion.js` | **Agregar** |
| `public/app.js` | Reemplazar |
| `tests/negociacion.test.js` | **Agregar** |

El archivo `INSTRUCCIONES_ACTUALIZACION.md` es opcional (documentación).

**No reemplaces** `api/bootstrap.js`, `api/action.js`, `api/gestion.js`, `lib/db.js`, `lib/service.js`, el SQL de modo demo ni otros archivos. Esta actualización depende de la versión anterior **con sesiones independientes ya instalada**.

**No hace falta ejecutar SQL** ni cambiar variables de Vercel: la base actual y la clave Groq siguen siendo las mismas.

## 2. Cómo instalar desde GitHub

1. En Windows, descarga y descomprime el ZIP.
2. En GitHub, abre `https://github.com/sebascarl28/Agente-Comercial-Gloria`.
3. `Add file` → `Upload files` → arrastra las carpetas `api`, `lib`, `public`, `tests` de la carpeta descomprimida (no arrastres la carpeta contenedora).
4. Verifica que `lib/negociacion.js` aparezca **junto a** `lib/service.js`, no dentro de una subcarpeta nueva.
5. Haz commit con mensaje `fix: negociar por chat y mostrar resumen al final`.
6. En Vercel → Deployments, revisa que el despliegue Production de `main` quede `Ready`. No hagas Redeploy manual si GitHub ya inició uno.

**Para probar antes sin afectar la web pública:** crea una rama `mejora-negociacion` desde `main`, sube allí los archivos y revisa su Preview. Solo tras validar, haz merge a `main`.

## 3. Pruebas sugeridas

Prueba en una **Nueva simulación**, con La Alameda:

1. `Necesito 300 cajas de leche UHT` → pregunta fecha deseada, no muestra resumen.
2. `Para el 16 de noviembre` → consulta stock; explica 250 liberadas, 50 previstas desde el 19 de noviembre, sin prometer entrega completa para el 16.
3. `Prefiero dos entregas` → propone 250 primero y 50 después, sujeto a QM y despacho; solicita aceptación.
4. `Sí, acepto las entregas` → guarda aceptación y pregunta la siguiente condición.
5. `Quiero 8% de descuento` → deriva a Jefatura (max. 12% sujeto a margen).
6. `¿Ya aprobaron mi descuento?` → consulta estado; no crea solicitud nueva.
7. En Jefatura, usa el PIN y ofrece un porcentaje autorizado. Vuelve al chat: `¿Qué respondió Jefatura?` → indica el porcentaje ofrecido y que falta tu aceptación.
8. `Acepto el descuento` → aplica el porcentaje aprobado.
9. `Pago a crédito` → valida línea de La Alameda. `Confirmo dirección` cuando el agente la solicite.
10. **Recién cuando todo esté acordado** aparece «Resumen final», con «Confirmar pedido»; confirma expresamente para registrar.
11. Nueva simulación o incógnito deben mantener los **datos base originales y aislados**.

**Pruebas automáticas realizadas:** `npm run check` y `npm test` en la copia completa del proyecto: 19 pruebas aprobadas. No se ha probado la conexión real con Groq/Supabase de tu cuenta desde este entorno; valida en Preview o Production.

## Notas

- Groq interpreta frases y contexto; **las reglas finales y las aprobaciones se ejecutan en el backend**, no por texto generado.
- La fecha de producción no equivale a despacho garantizado. Los pedidos con unidades previstas se registran como condicionales hasta Calidad y validación logística.
- No se modifican productos, créditos iniciales, stock base ni módulos de aislamiento de sesión.
