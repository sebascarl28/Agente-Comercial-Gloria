# Modo demo independiente — Agente Comercial Gloria

Esta actualización **no necesita otro GitHub, Vercel ni Supabase**. Cada pestaña o usuario recibe una sesión independiente con una copia de los datos originales.

## Qué modifica

- Cada sesión comienza con **La Alameda** (crédito S/ 30 000, 30 días), dos distribuidores, tres tipos de leche, **250 UHT liberadas**, **40 en inspección** (no disponibles) y **50 UHT previstas en producción**.
- Los chats, cotizaciones, nuevos clientes, descuentos, créditos, pedidos, reservas y aprobaciones están **aislados en la sesión**.
- **Finanzas** y **Jefatura Comercial** ven únicamente las solicitudes creadas en la pestaña actual, dentro de esa simulación. Para una misma demostración, cambia de pestaña *dentro de la aplicación*, no del navegador.
- Cada pestaña nueva (por URL pegada manualmente) y cada ventana de incógnito inicia una simulación diferente.
- **Recargar** conserva el historial de la simulación actual.
- Botón **↻ Nueva simulación** para empezar de cero sin tocar las tablas originales.
- Las fechas de producción se regeneran en cada sesión respecto de la fecha de la simulación. Producción prevista no equivale a stock liberado.
- Las sesiones inactivas más de 24 horas se eliminan de forma oportunista al crear otras sesiones (límite 60 sesiones activas). Se pueden limpiar manualmente con `SELECT public.demo_limpiar();` en SQL Editor. No ejecutar el borrado durante una demostración activa.

## Instalación — ESTE ORDEN ES IMPORTANTE

### 1. Supabase (primero)

Abre el proyecto **agente-comercial-gloria**, ve a **SQL Editor → New query** y ejecuta **solo**:

```
sql/03_simulaciones_aisladas.sql
```

Se creará `demo_sesiones` y funciones para crear copias independientes. No vuelvas a ejecutar `01_esquema.sql` ni `02_datos_demo.sql`, y **no borres las tablas de public**.

**Comprobación:** en SQL Editor debe decir `Modo demo instalado: public.demo_iniciar(uuid)`.

### 2. GitHub (segundo)

En el repositorio existente `sebascarl28/Agente-Comercial-Gloria`, sube **solo estos archivos**, respetando las rutas y reemplazando los existentes:

```
api/action.js
api/bootstrap.js
api/chat.js
api/gestion.js
lib/db.js
public/app.js
sql/03_simulaciones_aisladas.sql
tests/sesiones.test.js
```

No subas el ZIP cerrado, ni crees una carpeta `gloria_demo_patch` en la raíz: debes arrastrar el contenido de estas carpetas. Commit sugerido: `feat: aislar datos por simulacion y reiniciar chat`.

### 3. Vercel (tercero)

La rama `main` despliega automáticamente en Vercel. Ve a **Deployments** y verifica `Ready` en Production. Abre https://agente-comercial-gloria.vercel.app y recarga con Ctrl + Shift + R.

No cambies la variable `DATABASE_URL`. Conserva `GROQ_API_KEY`, `GROQ_MODEL`, `FINANZAS_PIN` y `JEFATURA_PIN`. El modo demo funciona aun si Groq está en modo guiado; arreglar la conexión Groq es un problema independiente.

## Pruebas de aceptación

1. Abre la URL en Chrome normal: chat limpio, sin cotizaciones previas. Cotiza 300 UHT: 250 libres + 50 previstas.
2. Abre URL en una ventana nueva de **incógnito**: chat limpio; La Alameda y datos iniciales iguales; **no** aparecen los mensajes del Chrome normal.
3. Cotiza 100 UHT en incógnito: no modifica los datos de Chrome normal.
4. En la misma ventana de incógnito, pasa a Jefatura o Finanzas usando las pestañas de la **misma web**: la solicitud permanece dentro de la sesión actual.
5. Recarga incógnito: se conserva la conversación de esa pestaña.
6. Presiona **Nueva simulación**: se borran las acciones de la sesión visible, y vuelve a haber 250 UHT disponibles.
7. Confirma un pedido en una simulación y crea otra: la segunda mantiene su stock original.

## Límites de la demostración

- Utiliza credenciales del backend en Vercel. No pegues credenciales en GitHub ni capturas.
- El proyecto sigue siendo una **demo académica**, no un ERP productivo. La separación de sesiones usa un UUID aleatorio guardado en `sessionStorage`; no reemplaza autenticación empresarial real ni control de tasa.
- Algunos navegadores restauran las pestañas cerradas y su `sessionStorage`: usa **Nueva simulación** para garantizar empezar de cero.
- Al duplicar una pestaña, algunos navegadores clonan `sessionStorage` y pueden compartir sesión. Abre una pestaña nueva pegando la URL o usa incógnito.
- Para múltiples aprobadores simultáneos en **distintos dispositivos** sobre una misma simulación, necesitaríamos acceso por roles con invitación específica. Este modo académico supone que el docente cambia a Finanzas/Jefatura dentro de la misma web.
- El SQL instala copias mediante `CREATE SCHEMA`/`CREATE TABLE`. Requiere que la cuenta de PostgreSQL de `DATABASE_URL` tenga permiso para crear esquemas y tablas, como el usuario `postgres` del proyecto. **No se pudo ejecutar una prueba de integración contra tu Supabase desde aquí**; las pruebas locales revisan estructura y sintaxis. Si el despliegue arroja error, revisa Vercel → Logs sin compartir contraseñas.
