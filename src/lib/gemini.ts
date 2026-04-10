/**
 * Gemini AI helper — centralizes all AI calls.
 * Uses @google/genai v1.49 with createUserContent + createPartFromBase64 helpers.
 * Model: gemini-2.0-flash (supports vision + JSON schema).
 */
import { GoogleGenAI, createUserContent, createPartFromBase64, Type } from '@google/genai';

const MODEL = 'gemini-2.0-flash';

function getClient(): GoogleGenAI {
  const key = process.env.GEMINI_API_KEY;
  if (!key || key === 'MY_GEMINI_API_KEY' || key.trim() === '') {
    throw new Error('GEMINI_API_KEY no configurada. Añádela en el fichero .env.');
  }
  return new GoogleGenAI({ apiKey: key });
}

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
  date: string | null;          // YYYY-MM-DD
  vendorName: string | null;
  vendorAddress: string | null;
  vendorCIF: string | null;
  concept: string | null;
  invoiceNumber: string | null;
  category: string | null;
}

/**
 * Reads an odometer image and returns the km reading.
 * rawBase64: pure base64 string (no data: prefix).
 */
export async function readOdometer(rawBase64: string): Promise<OdometerResult> {
  const ai = getClient();

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: createUserContent([
      createPartFromBase64(rawBase64, 'image/jpeg'),
      {
        text: `Eres un sistema OCR especializado en odómetros de vehículos.
Analiza la imagen y extrae el número total de kilómetros que muestra el odómetro.
- Devuelve SOLO el número entero sin puntos ni comas (ej: 87432).
- Si no puedes leerlo con certeza, devuelve null en km.
- Indica tu nivel de confianza: "high" si el número es claro, "medium" si hay algo de duda, "low" si es difícil de leer.
- En rawText pon el texto literal que ves en el odómetro.`,
      },
    ]),
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          km:         { type: Type.NUMBER, nullable: true },
          confidence: { type: Type.STRING },
          rawText:    { type: Type.STRING, nullable: true },
        },
        required: ['km', 'confidence'],
      },
    },
  });

  const text = response.text;
  if (!text) throw new Error('Gemini no devolvió respuesta para el odómetro.');
  return JSON.parse(text.trim()) as OdometerResult;
}

/**
 * Scans a ticket/invoice image and extracts all fiscal data.
 * rawBase64: pure base64 string (no data: prefix).
 */
export async function scanTicket(rawBase64: string): Promise<TicketResult> {
  const ai = getClient();
  const today = new Date().toISOString().split('T')[0];

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: createUserContent([
      createPartFromBase64(rawBase64, 'image/jpeg'),
      {
        text: `Eres un sistema de extracción de datos fiscales de tickets y facturas españolas.
Analiza esta imagen y extrae TODOS los datos fiscales que encuentres.

Reglas:
- amount: importe TOTAL final incluyendo IVA (lo que paga el cliente).
- baseAmount: base imponible (importe antes de IVA). null si no aparece.
- vatPercent: porcentaje de IVA aplicado (ej: 21, 10, 4). null si no aparece.
- vatAmount: importe del IVA en euros. null si no aparece.
- date: fecha de la operación en formato YYYY-MM-DD. Si no hay fecha, usa "${today}".
- vendorName: nombre del establecimiento o empresa emisora.
- vendorAddress: dirección completa del establecimiento (calle, número, ciudad, CP).
- vendorCIF: NIF/CIF del emisor del ticket (formato: letra + 8 dígitos, ej: B12345678 o 12345678A).
- concept: descripción breve del concepto o productos comprados (max 80 caracteres).
- invoiceNumber: número de factura o ticket si aparece. null si no hay.
- category: clasifica en uno de estos valores exactos según el tipo de gasto:
  "comida", "transporte", "alojamiento", "combustible", "material_oficina", "otros".

Si no encuentras algún campo, devuelve null para ese campo (nunca texto inventado).
Responde ÚNICAMENTE con JSON válido.`,
      },
    ]),
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          amount:        { type: Type.NUMBER, nullable: true },
          baseAmount:    { type: Type.NUMBER, nullable: true },
          vatPercent:    { type: Type.NUMBER, nullable: true },
          vatAmount:     { type: Type.NUMBER, nullable: true },
          date:          { type: Type.STRING, nullable: true },
          vendorName:    { type: Type.STRING, nullable: true },
          vendorAddress: { type: Type.STRING, nullable: true },
          vendorCIF:     { type: Type.STRING, nullable: true },
          concept:       { type: Type.STRING, nullable: true },
          invoiceNumber: { type: Type.STRING, nullable: true },
          category:      { type: Type.STRING, nullable: true },
        },
        required: ['amount', 'date', 'vendorName', 'category'],
      },
    },
  });

  const text = response.text;
  if (!text) throw new Error('Gemini no devolvió respuesta para el ticket.');
  return JSON.parse(text.trim()) as TicketResult;
}
