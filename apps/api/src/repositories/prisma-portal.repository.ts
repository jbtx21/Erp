// Prisma-Implementierung des Kundenportals (Produktionspfad, B13). Strikt auf die
// Firma gescopt; nur status-/versandnahe Felder (keine internen Geldfelder).

import { prisma } from "@texma/db";
import type {
  CustomerOrderView,
  PortalRepository,
} from "../modules/portal/portal.service.js";

export class PrismaPortalRepository implements PortalRepository {
  async ordersForCompany(companyId: string): Promise<CustomerOrderView[]> {
    const orders = await prisma.order.findMany({
      where: { companyId },
      orderBy: { createdAt: "desc" },
      select: {
        number: true,
        status: true,
        zugesagterLiefertermin: true,
        trackingNumber: true,
        createdAt: true,
      },
    });
    return orders.map((o) => ({ ...o }));
  }
}
