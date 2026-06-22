// In-Memory-Implementierung des Datensatz-Querschnitts (Tests/Dev).

import type {
  CollaborationRepository,
  RecordActivity,
  RecordAttachment,
  RecordComment,
} from "../modules/collaboration/collaboration.service.js";

export class InMemoryCollaborationRepository implements CollaborationRepository {
  private comments: RecordComment[] = [];
  private activities: RecordActivity[] = [];
  private attachments: RecordAttachment[] = [];
  private seq = 0;
  private id(p: string): string {
    return `${p}_${String(++this.seq)}`;
  }

  async listComments(entity: string, entityId: string): Promise<RecordComment[]> {
    return this.comments.filter((c) => c.entity === entity && c.entityId === entityId);
  }
  async addComment(i: { entity: string; entityId: string; author: string; text: string }): Promise<RecordComment> {
    const c: RecordComment = { id: this.id("cmt"), createdAt: new Date(), ...i };
    this.comments.push(c);
    return c;
  }

  async listActivities(entity: string, entityId: string): Promise<RecordActivity[]> {
    return this.activities.filter((a) => a.entity === entity && a.entityId === entityId);
  }
  async addActivity(i: {
    entity: string; entityId: string; kind: "TASK" | "EVENT"; title: string; dueDate: Date | null; createdBy: string;
  }): Promise<RecordActivity> {
    const a: RecordActivity = { id: this.id("act"), done: false, createdAt: new Date(), ...i };
    this.activities.push(a);
    return a;
  }
  async setActivityDone(id: string, done: boolean): Promise<RecordActivity | null> {
    const a = this.activities.find((x) => x.id === id);
    if (!a) return null;
    a.done = done;
    return a;
  }

  async listAttachments(entity: string, entityId: string): Promise<RecordAttachment[]> {
    return this.attachments.filter((a) => a.entity === entity && a.entityId === entityId);
  }
  async addAttachment(i: {
    entity: string; entityId: string; fileName: string; mimeType: string | null; url: string; uploadedBy: string;
  }): Promise<RecordAttachment> {
    const a: RecordAttachment = { id: this.id("att"), createdAt: new Date(), ...i };
    this.attachments.push(a);
    return a;
  }
}
