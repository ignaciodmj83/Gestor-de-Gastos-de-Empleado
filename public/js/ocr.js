// OCR helper built on top of Tesseract.js (loaded from CDN in index.html).
// Exposes (also at window.OCR):
//   OCR.scan(file, onProgress)        → { text, raw }
//   OCR.parseTicket(text)             → { subject, description, total, date }
//   OCR.parseMileage(text)            → { trip_date, origin, destination, km, notes }
//   OCR.attachScanButton(input, opts) → wires a "📷 Escanear" button to a file input + onScan callback
const OCR = (function () {
  let workerPromise = null;

  async function getWorker(onProgress) {
    if (!window.Tesseract) throw new Error('Tesseract no está cargado');
    // tesseract.js v5: Tesseract.createWorker('spa+eng', 1, { logger })
    if (!workerPromise) {
      workerPromise = window.Tesseract.createWorker('spa+eng', 1, {
        logger: (m) => { if (onProgress) onProgress(m); },
      });
    }
    return workerPromise;
  }

  async function scan(file, onProgress) {
    const worker = await getWorker(onProgress);
    const { data } = await worker.recognize(file);
    return { text: data.text || '', raw: data };
  }

  // ----- Parsers -----

  // Find a date in many common formats: 12/03/2026, 12-03-26, 2026-03-12, 12 mar 2026
  function extractDate(text) {
    const months = {
      ene: '01', enero: '01', feb: '02', febrero: '02', mar: '03', marzo: '03',
      abr: '04', abril: '04', may: '05', mayo: '05', jun: '06', junio: '06',
      jul: '07', julio: '07', ago: '08', agosto: '08', sep: '09', sept: '09', septiembre: '09',
      oct: '10', octubre: '10', nov: '11', noviembre: '11', dic: '12', diciembre: '12',
      jan: '01', january: '01', february: '02', march: '03', april: '04',
      june: '06', july: '07', august: '08', september: '09', october: '10', november: '11', december: '12',
    };
    // ISO yyyy-mm-dd
    let m = text.match(/\b(20\d{2})[-./](\d{1,2})[-./](\d{1,2})\b/);
    if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
    // dd/mm/yyyy or dd-mm-yyyy
    m = text.match(/\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](20\d{2}|\d{2})\b/);
    if (m) {
      let yyyy = m[3].length === 2 ? '20' + m[3] : m[3];
      return `${yyyy}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    }
    // dd <month> yyyy
    m = text.match(/\b(\d{1,2})\s+([a-záéíóú]{3,12})\.?\s+(20\d{2})\b/i);
    if (m) {
      const mo = months[m[2].toLowerCase().replace(/\.$/, '')];
      if (mo) return `${m[3]}-${mo}-${m[1].padStart(2, '0')}`;
    }
    return null;
  }

  // Find the largest "total" amount on the receipt
  function extractTotal(text) {
    const lines = text.split(/\r?\n/);
    let best = null;
    // Strong signal: lines containing TOTAL / IMPORTE / A PAGAR
    for (const ln of lines) {
      if (/total|importe\s*total|a\s*pagar|amount\s*due/i.test(ln)) {
        const amounts = [...ln.matchAll(/(\d{1,4}[.,]\d{2})\s*€?/g)].map(x => parseFloat(x[1].replace(',', '.')));
        if (amounts.length) {
          const v = Math.max(...amounts);
          if (best === null || v > best) best = v;
        }
      }
    }
    if (best !== null) return best;
    // Fallback: largest €-tagged amount in the whole text
    const all = [...text.matchAll(/(\d{1,4}[.,]\d{2})\s*€/g)].map(x => parseFloat(x[1].replace(',', '.')));
    if (all.length) return Math.max(...all);
    return null;
  }

  // Best-effort merchant / first non-empty meaningful line
  function extractMerchant(text) {
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    for (const ln of lines.slice(0, 6)) {
      // skip obviously non-merchant lines
      if (/^(factura|ticket|receipt|cif|nif|n\.?i\.?f\.?|tel|tlf|c\.\s*c\.|www\.)/i.test(ln)) continue;
      if (/^\d+[\d\s.,/-]*$/.test(ln)) continue;
      if (ln.length < 3) continue;
      return ln.replace(/\s{2,}/g, ' ');
    }
    return lines[0] || '';
  }

  function parseTicket(text) {
    const date = extractDate(text);
    const total = extractTotal(text);
    const merchant = extractMerchant(text);
    const subject = merchant
      ? (total != null ? `${merchant} — ${total.toFixed(2)}€` : merchant)
      : 'Gasto escaneado';
    const description = [
      date ? `Fecha: ${date}` : null,
      total != null ? `Importe: ${total.toFixed(2)}€` : null,
      '',
      '— Texto extraído —',
      text.trim(),
    ].filter(x => x !== null).join('\n');
    return { subject, description, total, date };
  }

  // Find a kilometer reading (e.g., "123 km", "45,7 km")
  function extractKm(text) {
    const m = text.match(/(\d{1,4}(?:[.,]\d{1,2})?)\s*km\b/i);
    if (m) return parseFloat(m[1].replace(',', '.'));
    return null;
  }

  // Heuristic origin/destination: look for "X → Y" or "X - Y" patterns,
  // or common labels "Origen:" / "Destino:"
  function extractRoute(text) {
    let origin = null, destination = null;
    let m = text.match(/origen\s*[:\-]\s*(.+)/i);
    if (m) origin = m[1].split(/\r?\n/)[0].trim();
    m = text.match(/destino\s*[:\-]\s*(.+)/i);
    if (m) destination = m[1].split(/\r?\n/)[0].trim();
    if (!origin || !destination) {
      // arrows or dashes between two place names on the same line
      m = text.match(/([A-ZÁÉÍÓÚÑ][\wÁÉÍÓÚÑáéíóúñ\s.\-]{2,30})\s*(?:→|->|—|–|-)\s*([A-ZÁÉÍÓÚÑ][\wÁÉÍÓÚÑáéíóúñ\s.\-]{2,30})/);
      if (m) {
        origin = origin || m[1].trim();
        destination = destination || m[2].trim();
      }
    }
    return { origin: origin || '', destination: destination || '' };
  }

  function parseMileage(text) {
    const trip_date = extractDate(text);
    const km = extractKm(text);
    const { origin, destination } = extractRoute(text);
    return {
      trip_date: trip_date || '',
      origin,
      destination,
      km: km != null ? km : '',
      notes: text.trim().slice(0, 240),
    };
  }

  // Renders a "📷 Escanear ticket/foto" button + hidden file input next to a target node.
  // opts.kind: 'ticket' | 'mileage'
  // opts.onResult(parsed, rawText): called after successful OCR
  // opts.statusEl: optional element where we render the progress UI
  function attachScanButton(parent, opts = {}) {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;flex-direction:column;gap:8px;margin-bottom:14px;';
    wrap.innerHTML = `
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button type="button" class="btn btn-secondary btn-sm ocr-trigger">📷 Escanear con cámara/imagen</button>
        <span style="color:var(--text-dim);font-size:11px;align-self:center;">
          Sube una foto y rellenaremos los campos automáticamente.
        </span>
      </div>
      <input type="file" accept="image/*" capture="environment" style="display:none;" class="ocr-input" />
      <div class="ocr-status"></div>
    `;
    parent.prepend(wrap);
    const trigger = wrap.querySelector('.ocr-trigger');
    const input = wrap.querySelector('.ocr-input');
    const status = wrap.querySelector('.ocr-status');
    trigger.addEventListener('click', () => input.click());
    input.addEventListener('change', async () => {
      const file = input.files && input.files[0];
      if (!file) return;
      status.innerHTML = `<div class="ocr-progress"><div class="ocr-spinner"></div>Cargando OCR (primera vez puede tardar 10–20 s)...</div>`;
      try {
        const { text } = await scan(file, (m) => {
          if (m.status && m.progress != null) {
            const pct = Math.round(m.progress * 100);
            status.innerHTML = `<div class="ocr-progress"><div class="ocr-spinner"></div>${UI.escapeHtml(m.status)} · ${pct}%</div>`;
          }
        });
        const parsed = opts.kind === 'mileage' ? parseMileage(text) : parseTicket(text);
        status.innerHTML = `<div class="ocr-progress" style="background:var(--success-soft);border-color:rgba(34,197,94,0.3);color:var(--success);">✓ Texto extraído. Revisa los campos antes de guardar.</div>`;
        if (opts.onResult) opts.onResult(parsed, text);
      } catch (err) {
        status.innerHTML = `<div class="error-msg">OCR falló: ${UI.escapeHtml(err.message || String(err))}</div>`;
      } finally {
        input.value = '';
      }
    });
    return wrap;
  }

  return { scan, parseTicket, parseMileage, attachScanButton };
})();
window.OCR = OCR;
