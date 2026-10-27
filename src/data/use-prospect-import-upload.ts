import { MAX_PROSPECT_IMPORT_BYTES } from 'tula-closeline-contract'
import { fingerprint } from '~/api/idempotency'
import { presentProspect } from '~/api/prospect-messages'
import { useApp } from '~/app-context'
import { MAX_IMPORT_WORDS } from '~/data/prospect-imports'
import { type CsvUploadState, useCsvUpload } from '~/data/use-csv-upload'

/** Where the chosen CSV stands; the stored state carries the new import's id. */
export type ProspectImportUploadState = CsvUploadState<{ readonly importId: string }>

/**
 * What is wrong with a chosen file before anything is sent, or null when it looks right. Only the
 * cheap checks are made here (extension, empty, size); the header and the rows are core's to judge.
 */
export function checkProspectImportFile(file: File): string | null {
  if (!file.name.toLowerCase().endsWith('.csv')) {
    return 'This is not a CSV. Upload a .csv file made from the template.'
  }
  if (file.size === 0) {
    return 'The file is empty. Upload a CSV with the header from the template and one row per Prospect.'
  }
  if (file.size > MAX_PROSPECT_IMPORT_BYTES) {
    return `This file is larger than ${MAX_IMPORT_WORDS}. Split it into smaller files.`
  }
  return null
}

/** Sends one CSV at a time as a Prospect import. */
export function useProspectImportUpload() {
  const app = useApp()
  return useCsvUpload<{ readonly importId: string }>({
    fingerprint: (file) => fingerprint.prospectImport(file.name, file.size, file.lastModified),
    upload: async (file, key, signal) => ({
      importId: (await app.core.uploadProspectImport(file, key, signal)).id,
    }),
    check: checkProspectImportFile,
    present: (error) => presentProspect(error).message,
    list: 'prospectImports',
  })
}
