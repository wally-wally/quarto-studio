import { createDocumentRepository } from "@/lib/documents/repository";
import { createDocumentService } from "@/lib/documents/service";
import { openAppDatabase } from "./connection";

export function createAppDocumentService() {
  const db = openAppDatabase();
  const repository = createDocumentRepository(db);

  return createDocumentService({ repository });
}
