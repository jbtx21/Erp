// Prisma-Lieferadressen-Repo (Produktionspfad). Standard-Markierung (isDefault) wird
// transaktional umgesetzt, damit je Firma höchstens eine Standardadresse existiert
// (Teilindex DeliveryAddress_default_per_company).

import { prisma } from "@texma/db";
import type { AddressFields, AddressRow, CompanyAddressRepository } from "../modules/company/company-address.service.js";

export class PrismaCompanyAddressRepository implements CompanyAddressRepository {
  async list(companyId: string): Promise<AddressRow[]> {
    return prisma.deliveryAddress.findMany({
      where: { companyId },
      orderBy: [{ isDefault: "desc" }, { label: "asc" }],
      select: { id: true, label: true, street: true, zip: true, city: true, country: true, isDefault: true },
    });
  }

  async create(companyId: string, fields: Required<AddressFields>, makeDefault: boolean): Promise<{ id: string }> {
    return prisma.$transaction(async (tx) => {
      if (makeDefault) await tx.deliveryAddress.updateMany({ where: { companyId, isDefault: true }, data: { isDefault: false } });
      return tx.deliveryAddress.create({ data: { companyId, ...fields, isDefault: makeDefault }, select: { id: true } });
    });
  }

  async update(id: string, fields: Partial<Required<AddressFields>>): Promise<void> {
    await prisma.deliveryAddress.update({ where: { id }, data: fields });
  }

  async companyIdOf(id: string): Promise<string | null> {
    const a = await prisma.deliveryAddress.findUnique({ where: { id }, select: { companyId: true } });
    return a?.companyId ?? null;
  }

  async orderCount(id: string): Promise<number> {
    return prisma.order.count({ where: { deliveryAddressId: id } });
  }

  async delete(id: string): Promise<void> {
    await prisma.deliveryAddress.delete({ where: { id } });
  }

  async setDefault(companyId: string, id: string): Promise<void> {
    await prisma.$transaction([
      prisma.deliveryAddress.updateMany({ where: { companyId, isDefault: true }, data: { isDefault: false } }),
      prisma.deliveryAddress.update({ where: { id }, data: { isDefault: true } }),
    ]);
  }
}
