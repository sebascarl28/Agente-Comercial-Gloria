# Entrega del Agente Comercial Gloria — GE703 PC3

**Enlaces para el docente:** [Aplicación desplegada](https://agente-comercial-gloria.vercel.app/) · [Video de la prueba](https://youtu.be/c_QibJL2jXM) · [Repositorio GitHub](https://github.com/sebascarl28/Agente-Comercial-Gloria). La grabación es respaldo: el caso normal y la excepción se ejecutan también en vivo desde la aplicación.

Este repositorio contiene un **prototipo académico** con datos sintéticos. Descarga el paquete desde GitHub: **Code → Download ZIP** en la rama `main`. El ZIP incluye:

| Contenido | Ubicación |
|---|---|
| Interfaz y recursos gráficos | `public/` |
| API y reglas comerciales/ERP simulado | `api/`, `lib/` |
| Esquema, datos ficticios y escenario PC3 | `sql/01_esquema.sql` a `sql/05_escenario_pc3_360.sql` |
| Configuración y dependencias | `vercel.json`, `package.json` |
| Guía de instalación y arquitectura | `README.md`, `FLUJO_DEL_AGENTE.md` |
| Casos y pruebas automatizadas | `PRUEBAS_PC3.md`, `tests/` |

## Ejecutar y evaluar

1. Se requiere Node.js **20 o posterior**, una base PostgreSQL en Supabase, un proyecto Vercel y, para conversación con IA, una cuenta/API key de DeepSeek o Groq. La dependencia npm directa es `pg` (`^8.13.0`), declarada en `package.json`; `npm install` obtiene sus dependencias transitivas. No se distribuye `node_modules`.
2. En una base **nueva**, ejecutar los cinco archivos de `sql/` en orden numérico. Contienen exclusivamente datos de demostración; el escenario PC3 incluye 360 cajas, un faltante de 20 de evaporada y producción prevista. No volver a ejecutar la carga inicial sobre una base que ya esté en uso.
3. En Vercel, importar este repositorio y configurar `DATABASE_URL` y al menos una de `DEEPSEEK_API_KEY` o `GROQ_API_KEY`; `GROQ_MODEL` es opcional. No hay PIN de acceso a la demo, Finanzas o Jefatura. Los pasos de despliegue y límites de la simulación se explican en `README.md`. El chat funciona en modo guiado cuando ninguna IA está disponible, con respuestas conversacionales más limitadas.
4. Para verificar el código sin credenciales: `npm install`, `npm test` y `npm run check`. Para evaluar la aplicación desplegada: [agente-comercial-gloria.vercel.app](https://agente-comercial-gloria.vercel.app/). La vista **Venta normal** muestra el flujo común; **Caso PC3 · 360 cajas** muestra el faltante y el escalamiento. Usa **Nueva simulación** antes de cada recorrido independiente.

## Accesos y privacidad

El ZIP **no contiene contraseñas, URI de base de datos ni claves API**. Para ejecutar una instalación independiente, el evaluador debe crear sus propios proyectos y credenciales de servicios; para usar la demo existente, basta abrir la URL anterior. Finanzas y Jefatura se operan directamente desde sus pestañas, sin PIN, en una simulación con datos ficticios. No se debe enviar la clave de Groq ni `DATABASE_URL` al evaluador para entrar en la demo. Cualquier persona con la URL puede usar las áreas simuladas y consumir cuota de Groq; no utilizar con datos reales.

## Licencias y alcance

- Código y dibujos de esta demostración: **uso académico**; el repositorio no declara una licencia de código abierto para reutilización por terceros. Las marcas y nombres Gloria se usan solo como referencia del caso de estudio, sin representar una integración oficial.
- Dependencia directa `pg` (node-postgres): [licencia MIT del proyecto](https://github.com/brianc/node-postgres/blob/master/LICENSE). Las dependencias transitivas se instalan con npm y conservan sus propias licencias.
- Vercel, Supabase y Groq son servicios externos, sujetos a sus condiciones y límites de cuenta. SAP/ERP, pasarela de pago y despachos reales **no** están integrados.

La prueba técnica valida el código y la lógica; una ejecución completa del chat requiere la base y los servicios configurados. El resumen de pedidos muestra propuestas sujetas a Calidad y logística cuando hay producción pendiente.


## Diagnóstico y recuperación ante fallos

Antes de la demo, abrir `/api/health?groq=1` (por ejemplo `https://agente-comercial-gloria.vercel.app/api/health?groq=1`). Responde un JSON con la configuración (sin mostrar claves) y el estado de cada servicio.

| Síntoma | Causa probable | Qué hacer |
|---|---|---|
| `/api/health` devuelve `base_datos.ok: false` | Supabase pausado, `DATABASE_URL` ausente o puerto incorrecto | Reanudar el proyecto en Supabase; usar la URI del *Transaction Pooler* (puerto 6543) en `DATABASE_URL` y volver a desplegar |
| El chat indica «La base de datos no respondió a tiempo» | Corte transitorio del pooler o arranque en frío | Esperar unos segundos y repetir el mensaje; el sistema ya reintentó la conexión una vez |
| El chat responde en «modo guiado» (`motor: respaldo_groq`) | Groq con límite (429), caído o lento | No hace falta intervenir: el sistema prueba un segundo modelo (`GROQ_MODEL_RESPALDO`, por defecto `openai/gpt-oss-20b`) y, si también falla, usa reglas locales durante unos segundos. Las reglas de stock, precio, crédito y aprobaciones **no** dependen de Groq. Si persiste, revisar la cuota en la consola de Groq |
| «Sesión demo ausente o inválida» | Pestaña antigua o almacenamiento del navegador bloqueado | Recargar la página o pulsar «Nueva simulación» |
| El caso no muestra la parada de la cerradora ni OP-EVA-1711 | Se abrió la demo general | Entrar con `?escenario=pc3` |
| El chat pregunta «¿de qué leche?» en vez de armar las 360 cajas | No se usó la frase que activa el caso | Pulsar el botón «▶ Iniciar caso PC3 · 360 cajas» (o escribir «Quiero preparar el caso PC3 del informe»); las fechas aparecen en el recuadro «Caso PC3 · Datos del escenario» |

Orden de la IA: DeepSeek (si existe DEEPSEEK_API_KEY) → modelo principal de Groq → segundo modelo de Groq → reglas locales. Con IA_PROVEEDOR_PRIMERO=groq el orden se invierte (Groq → DeepSeek). Si una IA falla, el agente pasa a la siguiente y, si todas fallan, usa las reglas locales. Fechas del caso PC3: se calculan solas al crear cada simulación y siempre caen en día hábil y no feriado (se evitan fines de semana, feriados nacionales y el 24 y 31 de diciembre). La parada de la cerradora es el día D de la simulación (el primer viernes hábil desde el día 10 del mes siguiente al real; por ejemplo, con fecha real 20/11/2026, D = viernes 11/12/2026), la primera entrega pedida es el lunes siguiente (14/12) y las 20 cajas de evaporada llegan el martes (15/12), igual que en el informe (viernes 13, lunes 16 y martes 17 de noviembre). Así las fechas siempre están por delante, sea cual sea el día de la exposición. En el informe el mismo caso aparece con 13, 16 y 17 de noviembre de 2026 (parada, entrega y faltante): la lógica es idéntica y solo cambian las fechas. La pantalla muestra «Simulación: <fecha>» y el recuadro del caso indica las fechas vigentes. Cada «Nueva simulación» recalcula las fechas; la propia aplicación ajusta las fechas de esa copia y no hay que ejecutar nada en Supabase (`sql/05_escenario_pc3_360.sql` sigue siendo el punto de partida con las fechas del informe). Para iniciar el caso basta pulsar el botón «▶ Iniciar caso PC3 · 360 cajas».

Variables opcionales de ajuste: `GROQ_MODEL`, `GROQ_MODEL_RESPALDO`, `DEEPSEEK_API_KEY`, `DEEPSEEK_MODEL` y `GROQ_TIMEOUT_MS` (por defecto 7000 ms por intento). La respuesta del chat incluye `proveedor_ia` (`groq` o `deepseek`) para la bitácora.
