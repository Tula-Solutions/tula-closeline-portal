import {
  checkDealImportHeaderText,
  DEAL_IMPORT_HEADER_PREFIX_CHARS,
  MAX_DEAL_IMPORT_BYTES,
  MAX_UTF8_BYTES_PER_CODE_POINT,
} from 'tula-closeline-contract'
import { fingerprint } from '~/api/idempotency'
import { presentSales } from '~/api/sales-messages'
import { useApp } from '~/app-context'
import { HEADER_PROBLEM_WORDS, MAX_IMPORT_WORDS } from '~/data/sales-history'
import { type CsvUploadState, useCsvUpload } from '~/data/use-csv-upload'

/** Where the chosen CSV stands. */
export type ImportUploadState = CsvUploadState

/** What is wrong with a chosen file before anything is sent, or null when it looks right. */
export async function checkImportFile(file: File): Promise<string | null> {
  if (!file.name.toLowerCase().endsWith('.csv')) {
    return 'This is not a CSV. Upload a .csv file made from the template.'
  }
  if (file.size === 0) {
    return 'The file is empty. Upload a CSV with the header from the template and one row per Deal.'
  }
  if (file.size > MAX_DEAL_IMPORT_BYTES) {
    return `This file is larger than ${MAX_IMPORT_WORDS}. Split it into smaller files.`
  }
  // Read enough bytes to hold the prefix the service checks, then cut to the same characters.
  const bytes = DEAL_IMPORT_HEADER_PREFIX_CHARS * MAX_UTF8_BYTES_PER_CODE_POINT
  const text = (await file.slice(0, bytes).text()).slice(0, DEAL_IMPORT_HEADER_PREFIX_CHARS)
  const header = checkDealImportHeaderText(text)
  if (!header.ok) {
    return `The first row does not match the template. ${HEADER_PROBLEM_WORDS[header.problem]}`
  }
  return null
}

/**
 * Sends one CSV at a time as a Deal import. The file is checked in the browser first (extension,
 * size, header), with the same contract functions the service uses.
 */
export function useImportUpload() {
  const app = useApp()
  return useCsvUpload({
    fingerprint: (file) => fingerprint.dealImport(file.name, file.size, file.lastModified),
    upload: async (file, key, signal) => {
      await app.salesHistory.uploadDealImport(file, key, signal)
      return {}
    },
    check: checkImportFile,
    present: (error) => presentSales(error, 'import-upload').message,
    list: 'dealImports',
  })
}
