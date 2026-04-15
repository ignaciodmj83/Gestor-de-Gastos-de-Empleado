/**
 * Express backend server
 * - En producción (Cloud Run): sirve el build estático de Vite + endpoints /api
 * - En desarrollo: solo los endpoints /api (Vite corre en :3000 y hace proxy a :3001)
 *
 * IMPORTANTE: GEMINI_API_KEY se lee de process.env del servidor,
 * nunca llega al navegador → seguro.
 */
import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import { GoogleGenAI, createUserContent, createPartFromBase64, Type } from '@google/genai';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: '10mb' })); // imágenes base64 pueden ser grandes

const PORT = parseInt(process.env.PORT ?? '3001', 10);
const MODEL = 'gemini-2.0-flash';

// ── Helper: obtiene cliente Gemini ────────────────────────────────────────────
function getAI(): GoogleGenAI {
  const key = process.env.GEMINI_API_KEY;
  if (!key || key === 'MY_GEMINI_API_KEY' || key.trim() === '') {
    throw new Error('GEMINI_API_KEY no configurada en el servidor.');
  }
  return new GoogleGenAI({ apiKey: key });
}

// ── POST /api/scan-odometer ───────────────────────────────────────────────────
app.post('/api/scan-odometer', async (req, res) => {
  const { base64 } = req.body as { base64?: string };
  if (!base64) {
    res.status(400).json({ error: 'Se requiere base64 de la imagen.' });
    return;
  }

  try {
    const ai = getAI();
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: createUserContent([
        createPartFromBase64(base64, 'image/jpeg'),
        {
          text: `Eres un sistema OCR especializado en odómetros de vehículos.
Analiza la imagen y extrae el número total de kilómetros.
- Devuelve el número entero sin puntos ni comas (ej: 87432).
- confidence: "high" si el número es claro, "medium" si hay duda, "low" si es difícil.
- rawText: el texto literal que ves en el odómetro.
- Si no puedes leerlo, devuelve null en km.`,
        },
      ]),
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            km:         { type: Type.NUMBER,  nullable: true },
            confidence: { type: Type.STRING },
            rawText:    { type: Type.STRING,  nullable: true },
          },
          required: ['km', 'confidence'],
        },
      },
    });

    const text = response.text;
    if (!text) throw new Error('Gemini no devolvió respuesta.');
    res.json(JSON.parse(text.trim()));
  } catch (err: any) {
    console.error('[scan-odometer]', err?.message);
    res.status(500).json({ error: err?.message ?? 'Error interno del servidor.' });
  }
});

// ── POST /api/scan-ticket ─────────────────────────────────────────────────────
app.post('/api/scan-ticket', async (req, res) => {
  const { base64 } = req.body as { base64?: string };
  if (!base64) {
    res.status(400).json({ error: 'Se requiere base64 de la imagen.' });
    return;
  }

  try {
    const ai = getAI();
    const today = new Date().toISOString().split('T')[0];

    const response = await ai.models.generateContent({
      model: MODEL,
      contents: createUserContent([
        createPartFromBase64(base64, 'image/jpeg'),
        {
          text: `Eres un sistema de extracción de datos fiscales de tickets y facturas españolas.
Analiza la imagen y extrae TODOS los datos fiscales presentes.

Reglas:
- amount: importe TOTAL final incluyendo IVA. Si hay varios importes, el mayor total.
- baseAmount: base imponible antes de IVA. null si no aparece.
- vatPercent: % de IVA (ej: 21, 10, 4). null si no aparece.
- vatAmount: importe del IVA en euros. null si no aparece.
- date: fecha en formato YYYY-MM-DD. Si no hay, usa "${today}".
- vendorName: nombre del establecimiento o empresa emisora.
- vendorAddress: dirección completa (calle, número, CP, ciudad). null si no aparece.
- vendorCIF: NIF/CIF del emisor (letra+dígitos o dígitos+letra). null si no aparece.
- concept: descripción breve del concepto o productos (max 80 chars). null si no aparece.
- invoiceNumber: número de factura/ticket si aparece. null si no hay.
- category: uno de estos valores exactos:
  "comida", "transporte", "alojamiento", "combustible", "material_oficina", "otros"

IMPORTANTE: Si no encuentras un campo, devuelve null (nunca inventes datos).
Responde ÚNICAMENTE con JSON válido, sin texto adicional.`,
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
    if (!text) throw new Error('Gemini no devolvió respuesta.');
    res.json(JSON.parse(text.trim()));
  } catch (err: any) {
    console.error('[scan-ticket]', err?.message);
    res.status(500).json({ error: err?.message ?? 'Error interno del servidor.' });
  }
});

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  const hasKey = !!(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY');
  res.json({ ok: true, gemini: hasKey ? 'configured' : 'missing' });
});

// ── Servir build estático de Vite (solo en producción) ────────────────────────
const distPath = path.join(__dirname, 'dist');
if (existsSync(distPath)) {
  app.use(express.static(distPath));
  // SPA fallback
  app.get('*', (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Servidor corriendo en http://0.0.0.0:${PORT}`);
  const hasKey = !!(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY');
  console.log(`🤖 Gemini API key: ${hasKey ? '✓ configurada' : '✗ NO configurada — IA desactivada'}`);
});
