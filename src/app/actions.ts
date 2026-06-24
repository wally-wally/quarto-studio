"use server";

import { createAppDocumentService } from "@/lib/db/app-service";
import type { SaveDocumentInput } from "@/lib/documents/types";

export async function selectDocumentAction(documentId: string) {
  return createAppDocumentService().getWorkspace(documentId);
}

export async function saveDocumentAction(input: SaveDocumentInput) {
  return createAppDocumentService().saveDocument(input);
}

export async function renderDocumentAction(input: SaveDocumentInput) {
  return createAppDocumentService().renderDocument(input);
}
