export interface Nudge {
  id: string;
  userId: string;
  assessmentId: string;
  dueAt: string;
  sentAt: string | null;
  cancelled: boolean;
}
