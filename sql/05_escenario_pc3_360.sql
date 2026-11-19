-- CASO PC3 OFICIAL, DATOS SINTÉTICOS DEL INFORME G6 (FECHAS RELATIVAS AL DÍA EN QUE SE CREA LA SESIÓN)
-- Ejecutar una vez DESPUÉS de 03_simulaciones_aisladas.sql y 04_cotizaciones_multiproducto.sql.
-- Nunca cambia public.stock_lotes, public.productos, ni sesiones demo normales.
-- Cada sesión con encabezado X-Demo-Scenario: pc3 recibe SU COPIA del escenario.
-- Día D = fecha de Lima al crear la sesión (queda guardada en pc3_mantenimiento.fecha y no avanza después).
-- Parada de la cerradora: D. Primera entrega pedida: D+3. Evaporada faltante prevista: D+4. Para el informe equivale a 13/11, 16/11 y 17/11.
CREATE OR REPLACE FUNCTION public.demo_pc3_configurar(p_id uuid)
RETURNS void LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE
  v_sc text;
  v_d date := (now() AT TIME ZONE 'America/Lima')::date;
BEGIN
  -- Serializa inicializaciones para evitar dos solicitudes simultáneas que sobrescriban stock.
  PERFORM pg_advisory_xact_lock(hashtextextended('caso-pc3-' || p_id::text, 0));
  SELECT esquema INTO v_sc FROM public.demo_sesiones WHERE id_sesion=p_id;
  IF v_sc IS NULL OR v_sc <> 'demo_' || replace(p_id::text,'-','') THEN
    RAISE EXCEPTION 'La sesión académica PC3 no ha sido inicializada';
  END IF;
  -- Si el registro ya está creado, jamás reiniciar pedidos ni reservas de esta sesión.
  IF to_regclass(format('%I.pc3_mantenimiento',v_sc)) IS NOT NULL THEN
    RETURN;
  END IF;
  -- Único marcador duradero del modo PC3 y traza de mantenimiento.
  EXECUTE format($q$
    CREATE TABLE %I.pc3_mantenimiento (
      id_evento text PRIMARY KEY, id_activo text NOT NULL, id_orden text NOT NULL,
      fecha date NOT NULL, duracion_horas numeric(5,2) NOT NULL,
      horas_turno numeric(5,2) NOT NULL, ritmo_cajas_h numeric(9,2) NOT NULL,
      orden_produccion text NOT NULL, causa text NOT NULL, estado text NOT NULL
    )
  $q$,v_sc);
  EXECUTE format($q$
    INSERT INTO %I.pc3_mantenimiento
       (id_evento,id_activo,id_orden,fecha,duracion_horas,horas_turno,ritmo_cajas_h,orden_produccion,causa,estado)
    VALUES
       ('VEN-CIE-001','ACT-EVA-CIE','OT-CIE-001',%L::date,2,8,800,
        'OP-EVA-1711','Mantenimiento programado de la cerradora (simulación académica)','PROGRAMADO')
  $q$,v_sc,v_d);

  -- Producto del informe: 400 g (no los 410 g que tenía la semilla anterior).
  EXECUTE format($q$
    UPDATE %I.productos SET nombre='Leche Evaporada Gloria 400 g',
      sku='GL-EVA-400',presentacion='Caja de 48 latas de 400 g'
    WHERE id_producto='PRD-002'
  $q$,v_sc);

  -- Stock físico liberado para el caso, sin reservas previas en esta NUEVA sesión.
  -- UHT: 250 disponibles, de los que se solicitan 180.
  -- Evaporada: 40 disponibles, se piden 60 (faltan 20).
  -- Fresca: 120 disponibles, se piden 120.
  EXECUTE format($q$
    UPDATE %I.stock_lotes SET
       cajas = CASE id_lote WHEN 'LOT-UHT-01' THEN 250
                           WHEN 'LOT-UHT-02' THEN 40
                           WHEN 'LOT-EVA-01' THEN 40
                           WHEN 'LOT-FRE-01' THEN 120 ELSE cajas END,
       calidad = CASE WHEN id_lote='LOT-UHT-02' THEN 'EN_INSPECCION' ELSE 'LIBERADO' END,
       fecha_vencimiento = CASE WHEN id_lote='LOT-FRE-01' THEN %L::date
                                WHEN id_lote='LOT-UHT-01' THEN DATE '2027-05-12'
                                WHEN id_lote='LOT-UHT-02' THEN DATE '2027-05-12'
                                WHEN id_lote='LOT-EVA-01' THEN DATE '2027-08-10'
                                ELSE fecha_vencimiento END,
       actualizado_en=now()
    WHERE id_lote IN ('LOT-UHT-01','LOT-UHT-02','LOT-EVA-01','LOT-FRE-01')
  $q$,v_sc,v_d+18);

  -- Los tres planes tienen fechas relativas al día D de la sesión, para que el caso sea coherente en cualquier exposición.
  -- Solo 20 cajas de evaporada son necesarias para completar SOL-LA-002.
  EXECUTE format($q$
    UPDATE %1$I.plan_produccion SET
      cajas = CASE id_plan WHEN 'PPPI-EVA-01' THEN 20
                           WHEN 'PPPI-UHT-01' THEN 50
                           WHEN 'PPPI-FRE-01' THEN 60 ELSE cajas END,
      fecha_produccion = CASE id_plan WHEN 'PPPI-EVA-01' THEN %2$L::date
                                       WHEN 'PPPI-UHT-01' THEN %3$L::date
                                       WHEN 'PPPI-FRE-01' THEN %2$L::date
                                       ELSE fecha_produccion END,
      fecha_disponibilidad = CASE id_plan WHEN 'PPPI-EVA-01' THEN %4$L::date
                                           WHEN 'PPPI-UHT-01' THEN %5$L::date
                                           WHEN 'PPPI-FRE-01' THEN %4$L::date
                                           ELSE fecha_disponibilidad END,
      referencia_pp_pi = CASE WHEN id_plan='PPPI-EVA-01' THEN 'OP-EVA-1711'
                             ELSE referencia_pp_pi END,
      estado='PROGRAMADO', requiere_liberacion_qm=true
    WHERE id_plan IN ('PPPI-UHT-01','PPPI-EVA-01','PPPI-FRE-01')
  $q$,v_sc,v_d+3,v_d+5,v_d+4,v_d+6);
END;
$$;
REVOKE ALL ON FUNCTION public.demo_pc3_configurar(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.demo_pc3_configurar(uuid) TO postgres;

SELECT 'Caso oficial PC3 instalado: 360 solicitadas / 340 cubiertas el 16-11 / 20 evaporada previstas el 17-11' AS estado;
