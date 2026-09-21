import { prisma } from "../../config/prisma.js";

export const storePermissionKeys = Object.freeze({
  createCharges: "createCharges",
  manageOrders: "manageOrders",
  storeChats: "storeChats",
});

export function normalizeStorePermissions(value) {
  const permissions = value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};

  return {
    createCharges: permissions.createCharges === true,
    manageOrders: permissions.manageOrders === true,
    storeChats: permissions.storeChats === true,
  };
}

export function membershipHasStorePermission(member, permission) {
  if (!member || member.status !== "ATIVO") return false;
  if (member.cargo === "DONO") return true;
  return normalizeStorePermissions(member.permissoes)[permission] === true;
}

export function userHasStorePermission(store, userId, permission) {
  if (store?.lojista?.usuario_id === userId) return true;
  return (store?.usuarios ?? []).some(
    (member) => member.usuario_id === userId
      && membershipHasStorePermission(member, permission),
  );
}

export function storePermissionAccessWhere(userId, permission) {
  return {
    OR: [
      { lojista: { usuario_id: userId } },
      {
        usuarios: {
          some: {
            status: "ATIVO",
            usuario_id: userId,
            OR: [
              { cargo: "DONO" },
              { permissoes: { equals: true, path: [permission] } },
            ],
          },
        },
      },
    ],
  };
}

export function serializeStoreAccess(member = null, { isOwner = false } = {}) {
  const ownerAccess = isOwner || member?.cargo === "DONO";
  const permissions = ownerAccess
    ? { createCharges: true, manageOrders: true, storeChats: true }
    : normalizeStorePermissions(member?.permissoes);

  return {
    isOwner: ownerAccess,
    permissions,
    role: ownerAccess ? "DONO" : member?.cargo ?? "ATENDENTE",
  };
}

export async function getStorePermissionUserIds(storeId, permission) {
  const store = await prisma.loja.findUnique({
    select: {
      lojista: { select: { usuario_id: true } },
      usuarios: {
        select: { usuario_id: true },
        where: {
          status: "ATIVO",
          OR: [
            { cargo: "DONO" },
            { permissoes: { equals: true, path: [permission] } },
          ],
        },
      },
    },
    where: { id: Number(storeId) },
  });
  return [...new Set([
    store?.lojista?.usuario_id,
    ...(store?.usuarios ?? []).map((member) => member.usuario_id),
  ].filter(Boolean))];
}
