ALTER TABLE "tipos_servico"
ADD COLUMN "requisitos_cadastro" JSONB;

ALTER TABLE "servicos_vendedor"
ADD COLUMN "dados_cadastro" JSONB;

UPDATE "tipos_servico"
SET "requisitos_cadastro" = jsonb_build_object(
  'requiresVehicle', true,
  'requiresDriverLicense', true,
  'requiresPlate', true,
  'vehicleKinds', jsonb_build_array('MOTO')
)
WHERE "slug" = 'motoboy';

UPDATE "tipos_servico"
SET "requisitos_cadastro" = jsonb_build_object(
  'requiresVehicle', true,
  'requiresDriverLicense', true,
  'requiresPlate', true,
  'vehicleKinds', jsonb_build_array('CARRO', 'UTILITARIO', 'CAMINHAO')
)
WHERE "slug" = 'frete';
