# Agente Comercial Gloria — PC3 SIE (UNI)

Prototipo académico **independiente del proyecto previo**. Asesor B2B de productos lácteos, diseñado para **Comercial La Alameda S.A.C.** y clientes mayoristas/distribuidores.

## Qué incluye esta primera versión

- Interfaz responsive blanca y azul: chat principal, Clientes, Productos (con imágenes ilustrativas), Cotizaciones, Pedidos, Stock/Lotes, Plan de Producción, Finanzas y Jefatura Comercial.
- **Groq** interpreta el lenguaje natural y conversa. El backend, no la IA, consulta PostgreSQL y aplica reglas de negocio. Si falta la API de Groq, el chat funciona de manera **guiada** (mensajes más limitados; se indica en pantalla).
- **La Alameda**: línea de crédito sintética de **S/ 30 000 a 30 días** aprobada previamente.
- Stock inicial de UHT: **250 cajas liberadas + 40 en inspección que NO cuentan como disponibles**; producción programada de **50 adicionales**, disponibles tentativamente a los seis días desde la carga del SQL.
- Caso normal y excepción por stock, opciones de entrega parcial voluntaria o por faltante, fechas propuestas por el cliente y sugeridas por el ERP simulado.
- Descuentos: agente máximo **5 %** sujeto al margen; Jefatura Comercial evalúa **más de 5 % y hasta 12 %** y puede autorizar menos. El cliente debe aceptar el descuento ofrecido.
- Crédito: nueva empresa inicia en **S/ 0**; solicita opcionalmente una línea; Finanzas aprueba, contraoferta o rechaza y el cliente acepta/rechaza el monto antes de activar la línea.
- Pago contado, crédito aprobado o esquema académico de **anticipo 40 % + saldo 60 %**. La tabla PAGOS registra vencimientos, **no** cobros reales.
- Resumen al existir cotización; el pedido solo se registra cuando pago/entregas están acordados, no hay aprobaciones pendientes y el backend revalida stock y crédito. Las unidades en planes PP-PI se asignan **condicionalmente**: no equivalen a stock liberado ni fecha logística garantizada.
- Historial de versiones de cotización, bandejas internas por rol y conversaciones almacenadas en la base de datos.

## 1. Crear base de datos nueva en Supabase

1. Ve a <https://supabase.com/dashboard> y crea un **proyecto nuevo** para este repositorio. No utilices el proyecto anterior si deseas mantenerlos independientes.
2. Abre **SQL Editor** y ejecuta **`sql/01_esquema.sql`**.
3. En otra consulta, ejecuta **`sql/02_datos_demo.sql`**.
4. En el **Project Settings → Database → Connection string**, copia el URI del **Session Pooler** (o el método de conexión disponible). Revisa si el entorno de Vercel necesita IPv4. Usa `sslmode=require` cuando corresponda.
5. Una contraseña que contenga caracteres reservados como `@`, `#`, `/` debe ir codificada en la URL (`@` se convierte en `%40`).

El esquema crea las tablas `clientes`, `contactos_cliente`, `direcciones_entrega`, `productos`, `stock_lotes`, `plan_produccion`, `cotizaciones`, `cotizacion_detalle`, `historial_cotizaciones`, `solicitudes_credito`, `solicitudes_descuento`, `pedidos`, `entregas`, `pagos`, `reservas_stock`, `asignaciones_produccion` y `conversaciones`.

> **Datos ficticios:** los RUC, celulares, contactos, correos y direcciones precargados son deliberadamente de ejemplo. Las imágenes SVG son ilustraciones creadas para esta demo, no fotografías oficiales de productos Gloria.

## 2. Subir los archivos a GitHub

Repositorio creado: **`sebascarl28/Agente-Comercial-Gloria`**.

1. Descarga el ZIP y **descomprímelo** en una carpeta de Windows.
2. En el repositorio, haz clic en **Add file → Upload files**.
3. Arrastra **el contenido de la carpeta** `Agente-Comercial-Gloria` (subcarpetas `api`, `lib`, `public`, `sql`, etc. y archivos de la raíz). **No** subas solamente el ZIP ni dejes todo dentro de otra carpeta anidada.
4. Confirma **Commit changes** en la rama `main`.
5. Comprueba que se vean `package.json`, `vercel.json`, `public`, `api`, `lib` y `sql` en la raíz de GitHub.

Si el navegador no acepta arrastrar carpetas, usa GitHub Desktop o VS Code con Git; la estructura interna debe mantenerse.

## 3. Crear Vercel aparte del proyecto antiguo

1. En <https://vercel.com/new>, **Import Git Repository** → `sebascarl28/Agente-Comercial-Gloria`.
2. Si solicita framework, elige **Other**. El proyecto ya contiene `vercel.json` con `outputDirectory=public` y funciones en `api/`.
3. En **Project Settings → Environment Variables**, configura las claves indicadas a continuación. Para el despliegue inicial puedes añadírselas antes del primer Deploy.
4. Pulsa Deploy / Redeploy. La URL raíz `/` abrirá el chat; no necesitarás `/asesor.html`.

### Variables de entorno (secretas, SOLO Vercel)

| Variable | Contenido |
|---|---|
| `DATABASE_URL` | URI privado PostgreSQL de **tu nuevo proyecto Supabase**. |
| `GROQ_API_KEY` | Tu clave de Groq para interpretar mensajes. |
| `GROQ_MODEL` | `openai/gpt-oss-120b` (puedes sustituir por un modelo soportado en tu cuenta). |
| `FINANZAS_PIN` | Una clave propia, privada, para el responsable que aprueba créditos. |
| `JEFATURA_PIN` | **Otra** clave distinta para quien evalúa descuentos. |
| `DEMO_ACCESS_PIN` (opcional) | Clave compartida que protege todas las llamadas de API en esta demo pública. |

En ningún caso compartas `DATABASE_URL`, PIN o claves Groq en chat, capturas de pantalla o archivos GitHub.

**Importante:** activar la protección de preview de Vercel puede exigir inicio de sesión; el usuario que evalúa la demo debe contar con acceso al dominio o con un enlace compartido. En una demo pública considera `DEMO_ACCESS_PIN` para evitar consumo de cuota de Groq y modificaciones por terceros.

## 4. Probar en el navegador

1. Selecciona **Comercial La Alameda S.A.C.** en el chat.
2. Escribe **«Necesito 300 cajas de leche UHT»**. Debería indicar **250 libres y 50 previstas** tras producción. También puedes pulsar **Cotizar**.
3. Ve a **Opciones de entrega**, elige dos entregas o propón fechas propias y acepta la propuesta.
4. Solicita **8 %**. El agente crea una solicitud pendiente.
5. Abre **Jefatura Comercial**, introduce `JEFATURA_PIN`, revisa el margen y autoriza por ejemplo **8 %**. Al regresar al chat, el cliente debe **Aceptar descuento**.
6. Selecciona **Opciones de pago → Crédito aprobado** (La Alameda ya tiene S/ 30 000).
7. Verifica que el resumen permite **Confirmar pedido**. El ERP revalida stock, asignaciones, crédito y aprobaciones antes de registrar.
8. **Clientes → Registrar nuevo cliente**. Usa un RUC de prueba de 11 dígitos no existente, elige `MAYORISTA` o `DISTRIBUIDOR`, luego **Solicitar crédito**. En Finanzas aprueba, contraoferta o rechaza. La decisión queda pendiente de aceptación del cliente; una oferta aprobada no activa la línea por sí sola.

Para una prueba normal que **no consuma** las 250 cajas UHT, cotiza por ejemplo **100 cajas de evaporada**; así podrás ejecutar después la excepción de UHT en la misma base de datos.

Más ideas en `PRUEBAS_PC3.md`.

## 5. Arquitectura y límites

```text
Navegador: public/index.html + styles.css + app.js
    ↓  API HTTPS de Vercel (con acceso opcional por PIN)
api/chat.js → lib/ai.js (Groq: interpreta/intenta conversar)
api/action.js → lib/service.js (cotizaciones, clientes, pagos, entregas, confirmación)
api/gestion.js → lib/service.js (decisiones humanas protegidas por PIN)
api/bootstrap.js → lectura del catálogo, stock y estado
    ↓
lib/db.js → PostgreSQL de Supabase (DATABASE_URL, solo en servidor)
```

- El chat **no inventa** stock, precio, crédito, descuentos autorizados ni promesas de entrega: se calculan/consultan en el backend. Si Groq falla, se usa un analizador guiado limitado.
- Una cotización maneja **un producto por vez** en este MVP. El SQL tiene tabla `cotizacion_detalle` para facilitar una segunda versión con varias líneas de producto.
- No integra SAP real, pasarela de pago, correos ni servicios de transportes; **simula integraciones** ERP (QM/PP-PI/stock/crédito) de forma auditable.
- Límite académico de seguridad: los PIN **no sustituyen autenticación real con roles**. No emplear para operaciones con clientes verdaderos ni para producción empresarial. No hospedar datos personales reales.
- Se sugieren fechas mediante inventario y producción; el sistema no confirma automáticamente una fecha logística ni libera un lote que sigue en inspección.

## 6. Pruebas técnicas

Con Node.js 20 o posterior:

```bash
npm install
npm test
npm run check
```

Para ejecución local de API/cliente se necesita configuración del proyecto de Vercel y las variables privadas; puedes usar `npx vercel dev` con la cuenta correspondiente.

---

**Hecho para una evaluación académica en GE703 – Sistemas Integrados Empresariales.**
