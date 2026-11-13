-- Ejecutar después de 01_esquema.sql. Datos 100% sintéticos, idempotentes.
-- Crea SOLO tres clientes iniciales; los nuevos nacen desde la interfaz.
BEGIN;
INSERT INTO clientes (id_cliente,razon_social,ruc,segmento,celular,correo,linea_credito,plazo_credito_dias)
VALUES
('CLI-LA-001','Comercial La Alameda S.A.C.','20600000001','MAYORISTA','900000101','compras@alameda.example.invalid',30000,30),
('CLI-SM-002','Distribuidora Santa María E.I.R.L.','20600000002','DISTRIBUIDOR','900000202','administracion@santamaria.example.invalid',0,0),
('CLI-NC-003','Distribuciones Norte Centro S.R.L.','20600000003','DISTRIBUIDOR','900000303','compras@nortecentro.example.invalid',0,0)
ON CONFLICT (id_cliente) DO NOTHING;
INSERT INTO contactos_cliente (id_contacto,id_cliente,nombre,cargo,celular,correo,principal)
VALUES ('CON-LA-01','CLI-LA-001','Luis Mendoza','Compras','900000111','luis@alameda.example.invalid',true),
('CON-LA-02','CLI-LA-001','Rosa Paredes','Finanzas','900000112','rosa@alameda.example.invalid',false),
('CON-SM-01','CLI-SM-002','Ana Salazar','Gerencia','900000222','ana@santamaria.example.invalid',true),
('CON-NC-01','CLI-NC-003','Jorge Castillo','Compras','900000333','jorge@nortecentro.example.invalid',true)
ON CONFLICT (id_contacto) DO NOTHING;
INSERT INTO direcciones_entrega (id_direccion,id_cliente,direccion,distrito,ciudad,referencia,principal)
VALUES ('DIR-LA-01','CLI-LA-001','Av. Ejemplo 2450','Ate','Lima','Dirección sintética',true),
('DIR-LA-02','CLI-LA-001','Jr. Demostración 450','Santa Anita','Lima','Punto de entrega alternativo',false),
('DIR-SM-01','CLI-SM-002','Av. Simulación 1880','San Juan de Lurigancho','Lima','Dirección sintética',true),
('DIR-NC-01','CLI-NC-003','Calle Modelo 120','Los Olivos','Lima','Dirección sintética',true)
ON CONFLICT (id_direccion) DO NOTHING;
INSERT INTO productos (id_producto,sku,nombre,tipo,presentacion,unidades_caja,precio,costo,margen_minimo,imagen)
VALUES
('PRD-001','GL-UHT-1L','Leche UHT Gloria Entera 1 L','UHT','Caja de 12 envases de 1 L',12,60.00,46.00,15,'/assets/leche-uht.svg'),
('PRD-002','GL-EVA-410','Leche Evaporada Gloria 410 g','EVAPORADA','Caja de 48 latas de 410 g',48,58.00,43.00,15,'/assets/leche-evaporada.svg'),
('PRD-003','GL-FRE-1L','Leche Fresca Gloria 1 L','FRESCA','Caja de 12 envases de 1 L',12,62.00,42.00,25,'/assets/leche-fresca.svg')
ON CONFLICT (id_producto) DO NOTHING;
INSERT INTO stock_lotes (id_lote,id_producto,almacen,cajas,calidad,fecha_vencimiento)
VALUES ('LOT-UHT-01','PRD-001','ALM-ATE',250,'LIBERADO',current_date+180),
('LOT-UHT-02','PRD-001','ALM-ATE',40,'EN_INSPECCION',current_date+180),
('LOT-EVA-01','PRD-002','ALM-ATE',300,'LIBERADO',current_date+270),
('LOT-FRE-01','PRD-003','ALM-FRIO',90,'LIBERADO',current_date+20)
ON CONFLICT (id_lote) DO NOTHING;
INSERT INTO plan_produccion (id_plan,id_producto,cajas,fecha_produccion,fecha_disponibilidad,estado,referencia_pp_pi)
VALUES ('PPPI-UHT-01','PRD-001',50,current_date+5,current_date+6,'PROGRAMADO','OP-UHT-001'),
('PPPI-EVA-01','PRD-002',80,current_date+7,current_date+8,'PROGRAMADO','OP-EVA-001'),
('PPPI-FRE-01','PRD-003',60,current_date+3,current_date+4,'PROGRAMADO','OP-FRE-001')
ON CONFLICT (id_plan) DO NOTHING;
COMMIT;
