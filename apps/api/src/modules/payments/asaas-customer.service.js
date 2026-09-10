import { AppError } from "../../utils/errors.js";
import { createAsaasCustomer } from "./asaas.client.js";
import { asaasRepository } from "./asaas.repository.js";

function onlyDigits(value = "") {
  return String(value).replace(/\D/g, "");
}

export async function ensureAsaasCustomer(userId) {
  const user = await asaasRepository.findUser({
    include: {
      enderecos: {
        orderBy: [{ principal: "desc" }, { atualizado_em: "desc" }],
        take: 1,
        where: { excluido_em: null },
      },
    },
    where: { id: userId },
  });

  if (!user?.cpf) {
    throw new AppError("Informe e valide seu CPF antes de usar o Pix", 409);
  }

  if (user.asaas_cliente_id) {
    return user.asaas_cliente_id;
  }

  const address = user.enderecos[0];
  const customer = await createAsaasCustomer({
    ...(address
      ? {
          address: address.rua,
          addressNumber: address.numero,
          complement: address.complemento || undefined,
          postalCode: onlyDigits(address.cep),
          province: address.bairro,
        }
      : {}),
    cpfCnpj: onlyDigits(user.cpf),
    email: user.email,
    externalReference: `DTJ:USER:${user.id}`,
    mobilePhone: onlyDigits(user.telefone),
    name: user.nome,
    notificationDisabled: true,
  });

  await asaasRepository.updateUser({
    data: { asaas_cliente_id: customer.id },
    where: { id: user.id },
  });

  return customer.id;
}
