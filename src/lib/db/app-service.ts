import { createDocumentRepository } from "@/lib/documents/repository";
import { createDocumentService } from "@/lib/documents/service";
import { getSql } from "./connection";

export function createAppDocumentService() {
  const sql = getSql();
  const repository = createDocumentRepository(sql);
  return createDocumentService({ repository });
}
