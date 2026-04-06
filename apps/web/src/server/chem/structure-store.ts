import {
  callChemServiceGetStructureRecord,
  callChemServiceSaveStructureRecord
} from "./chem-service-client";
import type { SaveStructureRecordInput, StructureRecord } from "./dto";

export const saveStructureRecord = async (input: SaveStructureRecordInput): Promise<StructureRecord> =>
  callChemServiceSaveStructureRecord(input);

export const getStructureRecord = (
  documentId: string,
  blockId: string,
  sessionId: string
): Promise<StructureRecord | undefined> =>
  callChemServiceGetStructureRecord(documentId, blockId, sessionId).then((payload) => payload.record);
