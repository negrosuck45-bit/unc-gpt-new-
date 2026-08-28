declare module "pdf-parse" {
  type PdfParseResult = {
    text: string
    numpages?: number
    info?: Record<string, unknown>
    metadata?: Record<string, unknown>
    version?: string
  }

  export default function pdfParse(dataBuffer: Uint8Array, options?: Record<string, unknown>): Promise<PdfParseResult>
}
