# Agente Comercial Gloria — PC3 SIE (UNI)

Prototipo académico **independiente del proyecto previo**. Asesor B2B de productos lácteos, diseñado para **Comercial La Alameda S.A.C.** y clientes mayoristas/distribuidores.

## Qué incluye el prototipo

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
2. En **SQL Editor**, ejecuta en orden `sql/01_esquema.sql`, `sql/02_datos_demo.sql`, `sql/03_simulaciones_aisladas.sql`, `sql/04_cotizaciones_multiproducto.sql` y `sql/05_escenario_pc3_360.sql`. El último instala el escenario académico PC3 sin cambiar los datos base de la demo normal. Si el proyecto ya funciona, no vuelvas a ejecutar los scripts de instalación; aplica solo migraciones pendientes.
3. En **Project Settings → Database → Connection string**, copia el URI del **Session Pooler** (o el método de conexión disponible). Revisa si el entorno de Vercel necesita IPv4. Usa `sslmode=require` cuando corresponda.
4. Una contraseña que contenga caracteres reservados como `@`, `#`, `/` debe ir codificada en la URL (`@` se convierte en `%40`).

El esquema crea las tablas `clientes`, `contactos_cliente`, `direcciones_entrega`, `productos`, `stock_lotes`, `plan_produccion`, `cotizaciones`, `cotizacion_detalle`, `historial_cotizaciones`, `solicitudes_credito`, `solicitudes_descuento`, `pedidos`, `entregas`, `pagos`, `reservas_stock`, `asignaciones_produccion` y `conversaciones`.

> **Datos ficticios:** los RUC, celulares, contactos, correos y direcciones precargados son deliberadamente de ejemplo. Las imágenes SVG son ilustraciones creadas para esta demo, no fotografías oficiales de productos Gloria.

## 2. Código y despliegue

Repositorio: **`sebascarl28/Agente-Comercial-Gloria`**. El código vive en `public/` (interfaz), `api/` (endpoints), `lib/` (reglas y servicios), `sql/` (instalación y escenario PC3) y `tests/` (pruebas). Los cambios se revisan en una rama y se unen a `main` mediante una pull request. Vercel despliega automáticamente los cambios de `main` si el proyecto conserva su integración con GitHub.

## 3. Configurar Vercel

1. Si aún no existe el proyecto en Vercel, entra a <https://vercel.com/new> y selecciona **Import Git Repository** → `sebascarl28/Agente-Comercial-Gloria`.
2. Si solicita framework, elige **Other**. El proyecto ya contiene `vercel.json` con `outputDirectory=public` y funciones en `api/`.
3. En **Project Settings → Environment Variables**, configura las claves indicadas a continuación. Para el despliegue inicial puedes añadírselas antes del primer Deploy.
4. Para la instalación inicial pulsa **Deploy**. Después, comprueba en **Deployments** que el commit unido a `main` termine en **Ready / Production**. La URL raíz `/` abre el chat.

### Variables de entorno (credenciales de servicios, SOLO Vercel)

| Variable | Contenido |
|---|---|
| `DATABASE_URL` | URI privado PostgreSQL de **tu nuevo proyecto Supabase**. |
| `GROQ_API_KEY` | Tu clave de Groq para interpretar mensajes. |
| `GROQ_MODEL` | `openai/gpt-oss-120b` (puedes sustituir por un modelo soportado en tu cuenta). |

En ningún caso compartas `DATABASE_URL` ni claves Groq en chat, capturas de pantalla o archivos GitHub. Finanzas y Jefatura no requieren contraseña en esta demostración; sus decisiones siguen validadas por las reglas comerciales del backend.

**Importante:** esta demo sin acceso por roles permite que cualquier visitante de la URL use Finanzas y Jefatura en su propia sesión de simulación y consuma cuota de Groq. No usar con datos reales. Si Vercel protege los previews, el evaluador debe usar el dominio público de producción.

## 4. Probar en el navegador

1. Selecciona **Comercial La Alameda S.A.C.** en el chat.
2. Escribe **«Necesito 300 cajas de leche UHT»**. Debería indicar **250 libres y 50 previstas** tras producción. También puedes pulsar **Cotizar**.
3. Ve a **Opciones de entrega**, elige dos entregas o propón fechas propias y acepta la propuesta.
4. Solicita **8 %**. El agente crea una solicitud pendiente.
5. Abre **Jefatura Comercial**, revisa el margen y autoriza por ejemplo **8 %** sin introducir PIN. Al regresar al chat, el cliente debe **Aceptar descuento**.
6. Selecciona **Opciones de pago → Crédito aprobado** (La Alameda ya tiene S/ 30 000).
7. Verifica que el resumen permite **Confirmar pedido**. El ERP revalida stock, asignaciones, crédito y aprobaciones antes de registrar.
8. **Clientes → Registrar nuevo cliente**. Usa un RUC de prueba de 11 dígitos no existente, elige `MAYORISTA` o `DISTRIBUIDOR`, luego **Solicitar crédito**. En Finanzas aprueba, contraoferta o rechaza. La decisión queda pendiente de aceptación del cliente; una oferta aprobada no activa la línea por sí sola.

Para una prueba normal que **no consuma** las 250 cajas UHT, cotiza por ejemplo **100 cajas de evaporada**; así podrás ejecutar después la excepción de UHT en la misma base de datos.

Más ideas en `PRUEBAS_PC3.md`.

## 5. Arquitectura y límites

```text
Navegador: public/index.html + styles.css + app.js
    ↓  API HTTPS de Vercel (demo pública sin contraseñas de acceso)
api/chat.js → lib/ai.js (Groq: interpreta/intenta conversar)
api/action.js → lib/service.js (cotizaciones, clientes, pagos, entregas, confirmación)
api/gestion.js → lib/service.js (decisiones de Finanzas y Jefatura validadas por reglas)
api/bootstrap.js → lectura del catálogo, stock y estado
    ↓
lib/db.js → PostgreSQL de Supabase (DATABASE_URL, solo en servidor)
```

- El chat **no inventa** stock, precio, crédito, descuentos autorizados ni promesas de entrega: se calculan/consultan en el backend. Si Groq falla, se usa un analizador guiado limitado.
- Una cotización admite hasta tres variedades de leche. El backend valida cantidades, descuentos y entregas por producto; cambiar una cantidad obliga a revisar la entrega y cualquier descuento autorizado.
- No integra SAP real, pasarela de pago, correos ni servicios de transportes; **simula integraciones** ERP (QM/PP-PI/stock/crédito) de forma auditable.
- Límite académico de seguridad: el acceso a las áreas es libre en esta demo. No emplear para operaciones con clientes verdaderos ni para producción empresarial. No hospedar datos personales reales.
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
