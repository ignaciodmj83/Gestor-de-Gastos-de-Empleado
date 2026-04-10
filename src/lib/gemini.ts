/**
 * Cliente Gemini para el FRONTEND.
 * NO llama a Gemini directamente — llama a los endpoints del servidor Express (/api/...).
 * Así la GEMINI_API_KEY nunca sale del servidor y no hay errores de CORS ni de clave.
 */

export interface OdometerResult {
  km: number | null;
  confidence: 'high' | 'medium' | 'low';
  rawText?: string;
}

export interface TicketResult {
  amount: number | null;
  baseAmount: number | null;
  vatPercent: number | null;
  vatAmount: number | null;
  date: string | null;
  vendorName: string | null;
  vendorAddress: string | null;
  vendorCIF: string | null;
  concept: string | null;
  invoiceNumber: string | null;
  category: string | null;
}

async function callApi<T>(endpoint: string, base64: string): Promise<T> {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ base64 }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(err.error ?? `Error ${res.status}`);
  }

  return res.json() as Promise<T>;
}

/**
 * Lee un odómetro desde una imagen base64 (sin prefijo data:).
 */
export async function readOdometer(rawBase64: string): Promise<OdometerResult> {
  return callApi<OdometerResult>('/api/scan-odometer', rawBase64);
}

/**
 * Extrae datos fiscales de un ticket/factura desde una imagen base64 (sin prefijo data:).
 */
export async function scanTicket(rawBase64: string): Promise<TicketResult> {
  return callApi<TicketResult>('/api/scan-ticket', rawBase64);
}
