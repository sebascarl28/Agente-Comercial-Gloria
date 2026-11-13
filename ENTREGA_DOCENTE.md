# Entrega del Agente Comercial Gloria — GE703 PC3

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

1. Se requiere Node.js **20 o posterior**, una base PostgreSQL en Supabase, un proyecto Vercel y, para conversación con IA, una cuenta/API key de Groq. La dependencia npm directa es `pg` (`^8.13.0`), declarada en `package.json`; `npm install` obtiene sus dependencias transitivas. No se distribuye `node_modules`.
2. En una base **nueva**, ejecutar los cinco archivos de `sql/` en orden numérico. Contienen exclusivamente datos de demostración; el escenario PC3 incluye 360 cajas, un faltante de 20 de evaporada y producción prevista. No volver a ejecutar la carga inicial sobre una base que ya esté en uso.
3. En Vercel, importar este repositorio y configurar `DATABASE_URL`, `GROQ_API_KEY`, `GROQ_MODEL`, `FINANZAS_PIN` y `JEFATURA_PIN`. `DEMO_ACCESS_PIN` es opcional. Los valores, pasos de despliegue y límites de la simulación se explican en `README.md`. El chat funciona en modo guiado cuando Groq no está disponible, con respuestas conversacionales más limitadas.
4. Para verificar el código sin credenciales: `npm install`, `npm test` y `npm run check`. Para evaluar la aplicación desplegada: [agente-comercial-gloria.vercel.app](https://agente-comercial-gloria.vercel.app/). La vista **Venta normal** muestra el flujo común; **Caso PC3 · 360 cajas** muestra el faltante y el escalamiento. Usa **Nueva simulación** antes de cada recorrido independiente.

## Accesos y privacidad

El ZIP **no contiene contraseñas, PIN, URI de base de datos ni claves API**. Para ejecutar una instalación independiente, el evaluador debe crear sus propios proyectos y credenciales; para usar la demo existente, se proporciona la URL anterior. Si la demo solicita `DEMO_ACCESS_PIN` o se debe evaluar una aprobación desde Jefatura/Finanzas, el responsable comunica esos PIN al docente **por un canal privado separado**, nunca en GitHub, el ZIP o capturas públicas. No se debe enviar la clave de Groq ni `DATABASE_URL` al evaluador para entrar en la demo.

## Licencias y alcance

- Código y dibujos de esta demostración: **uso académico**; el repositorio no declara una licencia de código abierto para reutilización por terceros. Las marcas y nombres Gloria se usan solo como referencia del caso de estudio, sin representar una integración oficial.
- Dependencia directa `pg` (node-postgres): [licencia MIT del proyecto](https://github.com/brianc/node-postgres/blob/master/LICENSE). Las dependencias transitivas se instalan con npm y conservan sus propias licencias.
- Vercel, Supabase y Groq son servicios externos, sujetos a sus condiciones y límites de cuenta. SAP/ERP, pasarela de pago y despachos reales **no** están integrados.

La prueba técnica valida el código y la lógica; una ejecución completa del chat requiere la base y los servicios configurados. El resumen de pedidos muestra propuestas sujetas a Calidad y logística cuando hay producción pendiente.
