export interface DemandChatMessage {
  role: "user" | "assistant";
  content: string;
  images?: string[];
  videos?: string[];
  documents?: { name: string; size: number; type?: string; text?: string }[];
}

export interface DemandExtractionState {
  subject?: string;
  format?: string;
  tagIds?: string[];
  dueDate?: string;
  referenceUrls?: string;
  notes?: string;
  requesterName?: string;
  isReadyToConfirm?: boolean;
}
