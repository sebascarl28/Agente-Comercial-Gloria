-- AGENTE COMERCIAL GLORIA — MODO DEMO INDEPENDIENTE
-- Ejecutar UNA SOLA VEZ en el SQL Editor del proyecto nuevo de Supabase.
-- NO elimina las tablas public.* existentes ni datos anteriores.
-- Cada sesión obtiene una copia propia de datos sintéticos en un esquema demo_<uuid>.
-- Conectar con el usuario PostgreSQL del backend (DATABASE_URL), NO exponerlo al frontend.

CREATE TABLE IF NOT EXISTS public.demo_sesiones (
  id_sesion uuid PRIMARY KEY,
  esquema text NOT NULL UNIQUE,
  creada_en timestamptz NOT NULL DEFAULT now(),
  ultima_actividad timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.demo_sesiones ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.demo_sesiones FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.demo_iniciar(p_id uuid)
RETURNS text
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_esquema text := 'demo_' || replace(p_id::text,'-','');
  v_tabla text;
BEGIN
  -- Evita que dos solicitudes simultáneas creen la misma sesión.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_id::text, 0));
  IF EXISTS (SELECT 1 FROM public.demo_sesiones WHERE id_sesion=p_id) THEN
    UPDATE public.demo_sesiones SET ultima_actividad=now() WHERE id_sesion=p_id;
    RETURN v_esquema;
  END IF;

  -- Limpieza automática y límite razonable de sesiones para la cuenta académica gratuita.
  PERFORM public.demo_limpiar(interval '24 hours');
  IF (SELECT count(*) FROM public.demo_sesiones) >= 60 THEN
    RAISE EXCEPTION 'Se alcanzó el límite académico de 60 simulaciones activas; limpia las inactivas o espera su vencimiento.';
  END IF;

  EXECUTE format('CREATE SCHEMA %I',v_esquema);
  -- LIKE ... INCLUDING ALL replica columnas, defaults, índices e identidad;
  -- no copia llaves foráneas, que se mantienen validadas por el backend académico.
  FOREACH v_tabla IN ARRAY ARRAY[
    'clientes','contactos_cliente','direcciones_entrega','productos','stock_lotes','plan_produccion',
    'cotizaciones','cotizacion_detalle','historial_cotizaciones','solicitudes_descuento',
    'solicitudes_credito','pedidos','entregas','pagos','reservas_stock',
    'asignaciones_produccion','conversaciones'
  ] LOOP
    EXECUTE format('CREATE TABLE %I.%I (LIKE public.%I INCLUDING ALL)',v_esquema,v_tabla,v_tabla);
  END LOOP;

  -- Seriales propios: no consumir secuencias del esquema público.
  EXECUTE format('CREATE SEQUENCE %I.reservas_stock_id_reserva_seq',v_esquema);
  EXECUTE format('ALTER SEQUENCE %I.reservas_stock_id_reserva_seq OWNED BY %I.reservas_stock.id_reserva',v_esquema,v_esquema);
  EXECUTE format('ALTER TABLE %I.reservas_stock ALTER COLUMN id_reserva SET DEFAULT nextval(%L::regclass)',v_esquema,v_esquema||'.reservas_stock_id_reserva_seq');
  EXECUTE format('CREATE SEQUENCE %I.asignaciones_produccion_id_asignacion_seq',v_esquema);
  EXECUTE format('ALTER SEQUENCE %I.asignaciones_produccion_id_asignacion_seq OWNED BY %I.asignaciones_produccion.id_asignacion',v_esquema,v_esquema);
  EXECUTE format('ALTER TABLE %I.asignaciones_produccion ALTER COLUMN id_asignacion SET DEFAULT nextval(%L::regclass)',v_esquema,v_esquema||'.asignaciones_produccion_id_asignacion_seq');

  -- Las 3 empresas y 3 leches del caso: NO copiar clientes nuevos previos.
  EXECUTE format($q$
    INSERT INTO %I.clientes
    SELECT * FROM public.clientes WHERE id_cliente IN ('CLI-LA-001','CLI-SM-002','CLI-NC-003')
  $q$,v_esquema);
  EXECUTE format($q$
    UPDATE %I.clientes SET
      linea_credito = CASE WHEN id_cliente='CLI-LA-001' THEN 30000 ELSE 0 END,
      plazo_credito_dias = CASE WHEN id_cliente='CLI-LA-001' THEN 30 ELSE 0 END,
      deuda_vigente = 0, estado='ACTIVO'
  $q$,v_esquema);
  EXECUTE format($q$INSERT INTO %I.contactos_cliente SELECT * FROM public.contactos_cliente
     WHERE id_cliente IN ('CLI-LA-001','CLI-SM-002','CLI-NC-003')$q$,v_esquema);
  EXECUTE format($q$INSERT INTO %I.direcciones_entrega SELECT * FROM public.direcciones_entrega
     WHERE id_cliente IN ('CLI-LA-001','CLI-SM-002','CLI-NC-003')$q$,v_esquema);
  EXECUTE format($q$INSERT INTO %I.productos SELECT * FROM public.productos
     WHERE id_producto IN ('PRD-001','PRD-002','PRD-003')$q$,v_esquema);
  EXECUTE format($q$INSERT INTO %I.stock_lotes SELECT * FROM public.stock_lotes
     WHERE id_lote IN ('LOT-UHT-01','LOT-UHT-02','LOT-EVA-01','LOT-FRE-01')$q$,v_esquema);
  EXECUTE format($q$
    UPDATE %I.stock_lotes SET
      cajas = CASE id_lote WHEN 'LOT-UHT-01' THEN 250 WHEN 'LOT-UHT-02' THEN 40
             WHEN 'LOT-EVA-01' THEN 300 WHEN 'LOT-FRE-01' THEN 90 END,
      calidad = CASE WHEN id_lote='LOT-UHT-02' THEN 'EN_INSPECCION' ELSE 'LIBERADO' END,
      fecha_vencimiento = current_date + CASE WHEN id_lote='LOT-FRE-01' THEN 20 ELSE 180 END,
      actualizado_en=now()
  $q$,v_esquema);
  EXECUTE format($q$INSERT INTO %I.plan_produccion SELECT * FROM public.plan_produccion
     WHERE id_plan IN ('PPPI-UHT-01','PPPI-EVA-01','PPPI-FRE-01')$q$,v_esquema);
  EXECUTE format($q$
    UPDATE %I.plan_produccion SET
      cajas = CASE id_plan WHEN 'PPPI-UHT-01' THEN 50 WHEN 'PPPI-EVA-01' THEN 80 ELSE 60 END,
      fecha_produccion = current_date + CASE id_plan WHEN 'PPPI-UHT-01' THEN 5
                              WHEN 'PPPI-EVA-01' THEN 7 ELSE 3 END,
      fecha_disponibilidad = current_date + CASE id_plan WHEN 'PPPI-UHT-01' THEN 6
                              WHEN 'PPPI-EVA-01' THEN 8 ELSE 4 END,
      estado='PROGRAMADO',requiere_liberacion_qm=true
  $q$,v_esquema);
  INSERT INTO public.demo_sesiones(id_sesion,esquema) VALUES (p_id,v_esquema);
  RETURN v_esquema;
END;
$$;
REVOKE ALL ON FUNCTION public.demo_iniciar(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.demo_iniciar(uuid) TO postgres;

-- Opcional: limpiar sesiones SIN actividad durante más de 24 horas.
-- Ejecutar manualmente: SELECT public.demo_limpiar();
CREATE OR REPLACE FUNCTION public.demo_limpiar(p_antiguedad interval DEFAULT interval '24 hours')
RETURNS integer LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE r record; n integer := 0;
BEGIN
  IF p_antiguedad < interval '1 hour' THEN RAISE EXCEPTION 'Mínimo 1 hora'; END IF;
  FOR r IN SELECT id_sesion,esquema FROM public.demo_sesiones
       WHERE ultima_actividad < now()-p_antiguedad FOR UPDATE SKIP LOCKED LOOP
    IF r.esquema !~ '^demo_[a-f0-9]{32}$' THEN RAISE EXCEPTION 'Nombre de esquema inesperado'; END IF;
    EXECUTE format('DROP SCHEMA IF EXISTS %I CASCADE',r.esquema);
    DELETE FROM public.demo_sesiones WHERE id_sesion=r.id_sesion;
    n := n+1;
  END LOOP;
  RETURN n;
END; $$;
REVOKE ALL ON FUNCTION public.demo_limpiar(interval) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.demo_limpiar(interval) TO postgres;

SELECT 'Modo demo instalado: public.demo_iniciar(uuid)' AS estado;
