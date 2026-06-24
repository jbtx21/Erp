// In-Memory-Inquiry-Repository für Unit-Tests/Dev.

import type { InquirySource, InquiryStatus } from "@texma/shared";
import type {
  CreateInquiryInput,
  InquiryRepository,
  InquiryRow,
} from "../modules/inquiry/inquiry.service.js";

interface Inquiry {
  id: string;
  number: string;
  status: InquiryStatus;
  companyId: string | null;
  kontaktName: string | null;
  quelle: InquirySource;
  text: string;
  verworfenGrund: string | null;
  quoteId: string | null;
  createdAt: Date;
}

export class InMemoryInquiryRepository implements InquiryRepository {
  private readonly inquiries = new Map<string, Inquiry>();
  private seq = 0;

  get(id: string): Inquiry | undefined {
    return this.inquiries.get(id);
  }

  async list(): Promise<InquiryRow[]> {
    return [...this.inquiries.values()].map((i) => ({ ...i })).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async create(input: CreateInquiryInput & { number: string }): Promise<{ id: string }> {
    const id = `inq_${++this.seq}`;
    this.inquiries.set(id, {
      id,
      number: input.number,
      status: "NEU",
      companyId: input.companyId ?? null,
      kontaktName: input.kontaktName ?? null,
      quelle: input.quelle,
      text: input.text,
      verworfenGrund: null,
      quoteId: null,
      createdAt: new Date(),
    });
    return { id };
  }

  async load(id: string): Promise<{ status: InquiryStatus; companyId: string | null; text: string } | null> {
    const i = this.inquiries.get(id);
    return i ? { status: i.status, companyId: i.companyId, text: i.text } : null;
  }

  async setStatus(id: string, status: InquiryStatus): Promise<void> {
    const i = this.inquiries.get(id);
    if (i) i.status = status;
  }

  async discard(id: string, grund: string): Promise<void> {
    const i = this.inquiries.get(id);
    if (i) {
      i.status = "VERWORFEN";
      i.verworfenGrund = grund;
    }
  }

  async convertToQuote(id: string, input: { quoteNumber: string; companyId: string }): Promise<{ quoteId: string }> {
    const i = this.inquiries.get(id);
    if (!i) throw new Error(`Inquiry ${id} nicht gefunden`);
    const quoteId = `quote_${input.quoteNumber}`;
    i.status = "ANGEBOT";
    i.quoteId = quoteId;
    return { quoteId };
  }
}
