import { createImportAnalysis, findImportProfile, getImportAnalysis, replaceSupplierOffers, saveImportProfile } from "./catalog";
import { analyzeExcel } from "./import-excel";
import { createImportService } from "./import-service";
import type { MappingOverrides } from "./import-types";

export const importService = createImportService({
  analyze: (input, options) => analyzeExcel(input, options),
  saveAnalysis: (record) => createImportAnalysis({
    id: record.id,
    fileHash: record.fileHash,
    fileName: record.fileName,
    supplierName: record.supplierName,
    analysis: record.analysis,
    expiresAt: record.expiresAt,
  }),
  loadAnalysis: getImportAnalysis,
  writeCatalog: replaceSupplierOffers,
  saveProfile: saveImportProfile,
});

export async function profileOverrides(fingerprint: string): Promise<MappingOverrides | undefined> {
  const profile = await findImportProfile(fingerprint);
  return profile?.mapping as MappingOverrides | undefined;
}
