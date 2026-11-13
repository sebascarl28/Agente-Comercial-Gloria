-- Ejecutar una única vez en SQL Editor de Supabase ANTES de actualizar el código en Vercel.
-- No elimina cotizaciones, pedidos ni datos base. Se aplica a nuevas sesiones demo.
BEGIN;
ALTER TABLE public.cotizacion_detalle DROP CONSTRAINT IF EXISTS cotizacion_detalle_id_cotizacion_key;
CREATE UNIQUE INDEX IF NOT EXISTS uq_cotizacion_detalle_producto ON public.cotizacion_detalle(id_cotizacion,id_producto);
ALTER TABLE public.entregas ADD COLUMN IF NOT EXISTS id_producto text REFERENCES public.productos(id_producto);
-- Los pedidos anteriores conservan id_producto=NULL; el backend identifica su producto de cabecera.
COMMIT;
SELECT 'Cotizaciones multiproducto preparadas' AS estado;
