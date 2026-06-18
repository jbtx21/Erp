// Anwendungsfall: Kundenreklamation / Workflow C (Kap. 20). Bindet die reine Logik
// (@texma/shared: costBearer/validateFollowUp) an die Persistenz. Ursache bestimmt den
// Kostenträger (Lieferant/Veredler/TEXMA); unplausible Ursache-Folge-Kombinationen
// werden abgewiesen. Repository als Interface → testbar ohne DB.

import {
  costBearer,
  validateFollowUp,
  type ComplaintInput,
  type CostBearer,
} from "@texma/shared";
import { buildEntry, type AuditSink } from "@texma/audit";

export class ReklamationValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReklamationValidationError";
  }
}

export interface ComplaintListItem {
  id: string;
  orderLineId: string;
  cause: string;
  followUp: string;
  costCents: number;
  costBearer: string;
  createdAt: Date;
}

export interface ReklamationRepository {
  create(input: ComplaintInput & { costBearer: CostBearer }): Promise<{ id: string }>;
  listByOrder(orderId: string, limit: number): Promise<ComplaintListItem[]>;
}

export class ReklamationService {
  constructor(
    private readonly repo: ReklamationRepository,
    private readonly audit: AuditSink
  ) {}

  async create(input: ComplaintInput): Promise<{ id: string; costBearer: CostBearer }> {
    const problems = validateFollowUp(input);
    if (problems.length > 0) {
      throw new ReklamationValidationError(problems.join(" "));
    }
    const bearer = costBearer(input.cause);
    const created = await this.repo.create({ ...input, costBearer: bearer });

    await this.audit.append(
      buildEntry({
        entity: "Complaint",
        entityId: created.id,
        action: "CREATE",
        after: { orderId: input.orderId, cause: input.cause, followUp: input.followUp, costBearer: bearer },
      })
    );

    return { id: created.id, costBearer: bearer };
  }

  listByOrder(orderId: string, limit: number): Promise<ComplaintListItem[]> {
    return this.repo.listByOrder(orderId, limit);
  }
}
