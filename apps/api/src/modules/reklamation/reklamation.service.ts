// Anwendungsfall: Kundenreklamation / Workflow C (Kap. 20). Bindet die reine Logik
// (@texma/shared: costBearer/validateFollowUp) an die Persistenz. Ursache bestimmt den
// Kostenträger (Lieferant/Veredler/TEXMA); unplausible Ursache-Folge-Kombinationen
// werden abgewiesen. Repository als Interface → testbar ohne DB.

import {
  costBearer,
  followUpAction,
  validateFollowUp,
  type ComplaintCause,
  type ComplaintInput,
  type CostBearer,
  type FollowUpType,
} from "@texma/shared";
import { buildEntry, type AuditSink } from "@texma/audit";
import { NumberingService } from "../numbering/numbering.service.js";

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

export interface ComplaintFollowUpData {
  orderId: string;
  companyId: string;
  invoiceId: string | null;
  followUp: FollowUpType;
  costCents: number;
}

export type FollowUpResult =
  | { type: "NONE" }
  | { type: "CREDIT_NOTE"; creditNoteId: string; number: string; amountCents: number }
  | { type: "REPRODUCTION"; orderId: string; number: string; express: boolean };

/** Bearbeitbare Felder einer Reklamation (Ursache bestimmt den Kostenträger neu). */
export interface UpdateComplaintInput {
  cause: ComplaintCause;
  followUp: FollowUpType;
  costCents: number;
}

export interface ReklamationRepository {
  create(input: ComplaintInput & { costBearer: CostBearer }): Promise<{ id: string }>;
  update(id: string, input: UpdateComplaintInput & { costBearer: CostBearer }): Promise<void>;
  load(id: string): Promise<ComplaintListItem | null>;
  listByOrder(orderId: string, limit: number): Promise<ComplaintListItem[]>;
  /** Folgevorgang-relevante Daten der Reklamation (inkl. Rechnung des Auftrags). */
  loadFollowUp(complaintId: string): Promise<ComplaintFollowUpData | null>;
  createCreditNote(input: { invoiceId: string; number: string; amountCents: number; reason: string }): Promise<{ id: string }>;
  createReproductionOrder(input: { companyId: string; number: string; sourceOrderId: string; express: boolean }): Promise<{ id: string }>;
}

export class ReklamationService {
  constructor(
    private readonly repo: ReklamationRepository,
    private readonly audit: AuditSink,
    /** Für Folgevorgänge (Gutschrift/Nachproduktion) — Belegnummern aus F1. */
    private readonly numbering?: NumberingService
  ) {}

  /**
   * Erzeugt den Folgevorgang einer Reklamation (B11): Gutschrift (Nummer aus F1)
   * oder Nachproduktions-Auftrag; KEINE → nichts. Idempotenz/Mehrfachauslösung
   * liegt beim Aufrufer (eine Reklamation = ein Folgevorgang).
   */
  async executeFollowUp(complaintId: string): Promise<FollowUpResult> {
    const c = await this.repo.loadFollowUp(complaintId);
    if (!c) throw new ReklamationValidationError(`Reklamation ${complaintId} nicht gefunden`);

    const { action, express } = followUpAction(c.followUp);
    if (action === "NONE") return { type: "NONE" };
    if (!this.numbering) throw new Error("NumberingService erforderlich für Folgevorgänge");

    if (action === "CREDIT_NOTE") {
      if (!c.invoiceId) {
        throw new ReklamationValidationError("Gutschrift ohne Rechnung zum Auftrag nicht möglich.");
      }
      const number = await this.numbering.next("CREDIT_NOTE");
      const cn = await this.repo.createCreditNote({
        invoiceId: c.invoiceId,
        number,
        amountCents: c.costCents,
        reason: `Reklamation ${complaintId}`,
      });
      await this.audit.append(
        buildEntry({ entity: "CreditNote", entityId: cn.id, action: "CREATE", after: { number, amountCents: c.costCents, complaintId } })
      );
      return { type: "CREDIT_NOTE", creditNoteId: cn.id, number, amountCents: c.costCents };
    }

    // REPRODUCTION (ggf. Express)
    const number = await this.numbering.next("ORDER");
    const ord = await this.repo.createReproductionOrder({
      companyId: c.companyId,
      number,
      sourceOrderId: c.orderId,
      express,
    });
    await this.audit.append(
      buildEntry({ entity: "Order", entityId: ord.id, action: "CREATE", after: { number, nachproduktionVon: c.orderId, express, complaintId } })
    );
    return { type: "REPRODUCTION", orderId: ord.id, number, express };
  }

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

  /** Bearbeitet Ursache/Folgevorgang/Kosten einer Reklamation; Kostenträger wird neu abgeleitet. GoBD-auditiert. */
  async update(id: string, input: UpdateComplaintInput): Promise<{ costBearer: CostBearer }> {
    const problems = validateFollowUp({ orderId: "", orderLineId: "", cause: input.cause, followUp: input.followUp, costCents: input.costCents });
    if (problems.length > 0) throw new ReklamationValidationError(problems.join(" "));
    const bearer = costBearer(input.cause);
    const prev = await this.repo.load(id);
    await this.repo.update(id, { ...input, costBearer: bearer });
    await this.audit.append(
      buildEntry({
        entity: "Complaint", entityId: id, action: "UPDATE",
        before: prev ? { cause: prev.cause, followUp: prev.followUp, costCents: prev.costCents, costBearer: prev.costBearer } : undefined,
        after: { cause: input.cause, followUp: input.followUp, costCents: input.costCents, costBearer: bearer },
      })
    );
    return { costBearer: bearer };
  }
}
