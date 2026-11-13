-- AGENTE COMERCIAL GLORIA (PC3) – Proyecto NUEVO de Supabase.
-- Ejecutar SOLO en la base nueva. Los registros son ficticios.
-- Usar backend Node con DATABASE_URL; nunca conectarse desde el navegador con credenciales.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS clientes (
  id_cliente text PRIMARY KEY,
  razon_social text NOT NULL,
  ruc text NOT NULL UNIQUE,
  segmento text NOT NULL CHECK (segmento IN ('MAYORISTA','DISTRIBUIDOR')),
  celular text NOT NULL,
  correo text NOT NULL,
  estado text NOT NULL DEFAULT 'ACTIVO',
  linea_credito numeric(12,2) NOT NULL DEFAULT 0 CHECK (linea_credito>=0),
  plazo_credito_dias integer NOT NULL DEFAULT 0 CHECK (plazo_credito_dias>=0),
  deuda_vigente numeric(12,2) NOT NULL DEFAULT 0 CHECK (deuda_vigente>=0),
  creado_en timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS contactos_cliente (
  id_contacto text PRIMARY KEY, id_cliente text NOT NULL REFERENCES clientes(id_cliente),
  nombre text NOT NULL, cargo text, celular text, correo text, principal boolean DEFAULT true
);
CREATE TABLE IF NOT EXISTS direcciones_entrega (
  id_direccion text PRIMARY KEY, id_cliente text NOT NULL REFERENCES clientes(id_cliente),
  direccion text NOT NULL, distrito text NOT NULL, ciudad text DEFAULT 'Lima', referencia text, principal boolean DEFAULT true
);
CREATE TABLE IF NOT EXISTS productos (
  id_producto text PRIMARY KEY, sku text UNIQUE NOT NULL, nombre text NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('UHT','EVAPORADA','FRESCA')),
  presentacion text NOT NULL, unidades_caja integer NOT NULL,
  precio numeric(12,2) NOT NULL CHECK (precio>0),
  costo numeric(12,2) NOT NULL CHECK (costo>=0),
  margen_minimo numeric(5,2) NOT NULL DEFAULT 15,
  imagen text NOT NULL DEFAULT '/assets/leche-uht.svg',
  activo boolean NOT NULL DEFAULT true
);
CREATE TABLE IF NOT EXISTS stock_lotes (
  id_lote text PRIMARY KEY, id_producto text NOT NULL REFERENCES productos(id_producto),
  almacen text NOT NULL, cajas integer NOT NULL CHECK (cajas>=0),
  calidad text NOT NULL CHECK (calidad IN ('LIBERADO','EN_INSPECCION','BLOQUEADO')),
  fecha_vencimiento date NOT NULL, actualizado_en timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS plan_produccion (
  id_plan text PRIMARY KEY, id_producto text NOT NULL REFERENCES productos(id_producto),
  cajas integer NOT NULL CHECK (cajas>=0), fecha_produccion date NOT NULL,
  fecha_disponibilidad date NOT NULL, estado text NOT NULL DEFAULT 'PROGRAMADO',
  referencia_pp_pi text, requiere_liberacion_qm boolean NOT NULL DEFAULT true
);
CREATE TABLE IF NOT EXISTS cotizaciones (
  id_cotizacion uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_cliente text NOT NULL REFERENCES clientes(id_cliente),
  id_direccion text REFERENCES direcciones_entrega(id_direccion),
  direccion_confirmada boolean NOT NULL DEFAULT false,
  id_producto text NOT NULL REFERENCES productos(id_producto),
  cantidad integer NOT NULL CHECK (cantidad>0),
  version integer NOT NULL DEFAULT 1,
  descuento_pct numeric(5,2) NOT NULL DEFAULT 0,
  subtotal numeric(12,2) NOT NULL,
  igv numeric(12,2) NOT NULL,
  total numeric(12,2) NOT NULL,
  forma_pago text NOT NULL DEFAULT 'SIN_DEFINIR' CHECK (forma_pago IN ('SIN_DEFINIR','CONTADO','CREDITO','ANTICIPO')),
  porcentaje_anticipo integer DEFAULT 40,
  entregas jsonb NOT NULL DEFAULT '[]'::jsonb,
  entrega_aceptada boolean NOT NULL DEFAULT false,
  estado text NOT NULL DEFAULT 'BORRADOR',
  fecha_emision date NOT NULL DEFAULT current_date,
  actualizado_en timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS cotizacion_detalle (
  id_detalle uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_cotizacion uuid NOT NULL UNIQUE REFERENCES cotizaciones(id_cotizacion),
  id_producto text NOT NULL REFERENCES productos(id_producto),
  cantidad integer NOT NULL CHECK (cantidad>0),
  precio_unitario numeric(12,2) NOT NULL,
  descuento_pct numeric(5,2) NOT NULL DEFAULT 0,
  subtotal numeric(12,2) NOT NULL
);
CREATE TABLE IF NOT EXISTS historial_cotizaciones (
  id_historial bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_cotizacion uuid REFERENCES cotizaciones(id_cotizacion),
  version integer NOT NULL, motivo text NOT NULL, instantanea jsonb NOT NULL,
  creado_en timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS solicitudes_descuento (
  id_solicitud uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_cotizacion uuid NOT NULL REFERENCES cotizaciones(id_cotizacion),
  id_cliente text NOT NULL REFERENCES clientes(id_cliente),
  solicitado_pct numeric(5,2) NOT NULL,
  ofrecido_pct numeric(5,2),
  estado text NOT NULL DEFAULT 'PENDIENTE_JEFATURA',
  comentario text, responsable text,
  creado_en timestamptz NOT NULL DEFAULT now(), decidido_en timestamptz, respondido_cliente_en timestamptz
);
CREATE TABLE IF NOT EXISTS solicitudes_credito (
  id_solicitud uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_cliente text NOT NULL REFERENCES clientes(id_cliente),
  monto_solicitado numeric(12,2) NOT NULL CHECK (monto_solicitado>0),
  plazo_solicitado integer NOT NULL,
  monto_ofrecido numeric(12,2), plazo_ofrecido integer,
  estado text NOT NULL DEFAULT 'PENDIENTE_FINANZAS',
  comentario text, responsable text,
  creado_en timestamptz NOT NULL DEFAULT now(), decidido_en timestamptz, respondido_cliente_en timestamptz
);
CREATE TABLE IF NOT EXISTS pedidos (
  id_pedido uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_cotizacion uuid NOT NULL UNIQUE REFERENCES cotizaciones(id_cotizacion),
  id_cliente text NOT NULL REFERENCES clientes(id_cliente),
  estado text NOT NULL, total numeric(12,2) NOT NULL,
  entregas jsonb NOT NULL, forma_pago text NOT NULL,
  creado_en timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS entregas (
  id_entrega uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_pedido uuid NOT NULL REFERENCES pedidos(id_pedido),
  numero_parte integer NOT NULL,
  cajas integer NOT NULL CHECK (cajas>0),
  fecha_propuesta date NOT NULL,
  origen text NOT NULL CHECK (origen IN ('STOCK','PRODUCCION')),
  estado text NOT NULL DEFAULT 'PROGRAMADA_CONDICIONAL'
);
CREATE TABLE IF NOT EXISTS pagos (
  id_pago uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_pedido uuid NOT NULL REFERENCES pedidos(id_pedido),
  tipo text NOT NULL,
  monto numeric(12,2) NOT NULL CHECK (monto>=0),
  fecha_vencimiento date,
  estado text NOT NULL DEFAULT 'PENDIENTE'
);
CREATE TABLE IF NOT EXISTS reservas_stock (
  id_reserva bigserial PRIMARY KEY, id_pedido uuid NOT NULL REFERENCES pedidos(id_pedido),
  id_lote text NOT NULL REFERENCES stock_lotes(id_lote), cajas integer NOT NULL CHECK (cajas>0)
);
CREATE TABLE IF NOT EXISTS asignaciones_produccion (
  id_asignacion bigserial PRIMARY KEY, id_pedido uuid NOT NULL REFERENCES pedidos(id_pedido),
  id_plan text NOT NULL REFERENCES plan_produccion(id_plan), cajas integer NOT NULL CHECK (cajas>0),
  estado text NOT NULL DEFAULT 'CONDICIONAL'
);
CREATE TABLE IF NOT EXISTS conversaciones (
  id_conversacion uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_cliente text NOT NULL REFERENCES clientes(id_cliente),
  id_cotizacion uuid REFERENCES cotizaciones(id_cotizacion),
  mensajes jsonb NOT NULL DEFAULT '[]'::jsonb,
  actualizado_en timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_cotizaciones_cliente ON cotizaciones(id_cliente,actualizado_en DESC);
CREATE INDEX IF NOT EXISTS ix_conversaciones_cliente ON conversaciones(id_cliente,actualizado_en DESC);
CREATE INDEX IF NOT EXISTS ix_solicitudes_credito_estado ON solicitudes_credito(estado);
CREATE INDEX IF NOT EXISTS ix_solicitudes_descuento_estado ON solicitudes_descuento(estado);

-- Seguridad académica: accesible únicamente vía backend que usa credenciales del servidor.
-- No crear políticas anónimas ni exponer DATABASE_URL en frontend.

-- Supabase Data API: ninguna tabla del prototipo es accesible por el rol anon.
-- El usuario PostgreSQL del backend actúa como dueño del esquema para operaciones simuladas.
DO $$
DECLARE nombre text;
BEGIN
  FOREACH nombre IN ARRAY ARRAY[
    'clientes','contactos_cliente','direcciones_entrega','productos','stock_lotes','plan_produccion',
    'cotizaciones','cotizacion_detalle','historial_cotizaciones','solicitudes_descuento',
    'solicitudes_credito','pedidos','entregas','pagos','reservas_stock',
    'asignaciones_produccion','conversaciones'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', nombre);
  END LOOP;
END $$;
