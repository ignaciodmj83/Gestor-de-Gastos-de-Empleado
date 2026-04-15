import React, { useState, useRef } from 'react';
import { collection, addDoc, Timestamp } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '@/src/lib/firebase';
import { useAuth } from './AuthProvider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Receipt, Camera, Sparkles, Loader2, AlertCircle, CheckCircle2, X, Building2, MapPin, Hash, FileText } from 'lucide-react';
import { compressImage, toRawBase64 } from '@/src/lib/imageUtils';
import { scanTicket, TicketResult } from '@/src/lib/gemini';
import { TICKET_CATEGORIES, TicketCategory } from '@/src/types';

export function TicketForm() {
  const { profile } = useAuth();
  const [amount, setAmount] = useState('');
  const [baseAmount, setBaseAmount] = useState('');
  const [vatPercent, setVatPercent] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [vendorName, setVendorName] = useState('');
  const [vendorAddress, setVendorAddress] = useState('');
  const [vendorCIF, setVendorCIF] = useState('');
  const [concept, setConcept] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [category, setCategory] = useState<TicketCategory>('otros');
  const [photoUrl, setPhotoUrl] = useState('');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanMsg, setScanMsg] = useState<{ type: 'error' | 'success'; text: string } | null>(null);
  const [aiResult, setAiResult] = useState<TicketResult | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setScanMsg(null);
    setAiResult(null);
    setScanning(true);

    try {
      const reader = new FileReader();
      const dataUrl = await new Promise<string>((res, rej) => {
        reader.onloadend = () => res(reader.result as string);
        reader.onerror = rej;
        reader.readAsDataURL(file);
      });

      // Compress (safe for Firestore) + show preview immediately
      const compressed = await compressImage(dataUrl);
      setPhotoUrl(compressed);
      const raw = toRawBase64(compressed);

      // Call Gemini
      let result: TicketResult;
      try {
        result = await scanTicket(raw);
      } catch (geminiErr: any) {
        setScanMsg({ type: 'error', text: `IA no disponible: ${geminiErr?.message || 'Error'}. Rellena los datos manualmente.` });
        return;
      }

      setAiResult(result);

      // Populate form fields
      if (result.amount != null && result.amount > 0) setAmount(String(result.amount));
      if (result.baseAmount != null) setBaseAmount(String(result.baseAmount));
      if (result.vatPercent != null) setVatPercent(String(result.vatPercent));
      if (result.date) { const d = new Date(result.date); if (!isNaN(d.getTime())) setDate(result.date); }
      if (result.vendorName)    setVendorName(result.vendorName);
      if (result.vendorAddress) setVendorAddress(result.vendorAddress);
      if (result.vendorCIF)     setVendorCIF(result.vendorCIF);
      if (result.concept)       setConcept(result.concept);
      if (result.invoiceNumber) setInvoiceNumber(result.invoiceNumber);
      if (result.category && TICKET_CATEGORIES.find(c => c.value === result.category)) {
        setCategory(result.category as TicketCategory);
      }

      // Build summary of extracted fields
      const extracted = [
        result.vendorName && `🏪 ${result.vendorName}`,
        result.vendorCIF  && `CIF: ${result.vendorCIF}`,
        result.amount     && `💶 ${result.amount.toFixed(2)} €`,
        result.vatPercent && `IVA: ${result.vatPercent}%`,
        result.date       && `📅 ${result.date}`,
      ].filter(Boolean).join(' · ');

      setScanMsg({ type: 'success', text: `Datos extraídos: ${extracted || 'ticket analizado'}` });
      toast.success('Ticket analizado con IA ✨');
    } catch (err: any) {
      setScanMsg({ type: 'error', text: `Error al procesar imagen: ${err?.message || 'Error desconocido'}` });
      toast.error('Error al procesar la imagen');
    } finally {
      setScanning(false);
      if (fileInputRef.current)   fileInputRef.current.value = '';
      if (cameraInputRef.current) cameraInputRef.current.value = '';
    }
  };

  const resetForm = () => {
    setAmount(''); setBaseAmount(''); setVatPercent('');
    setVendorName(''); setVendorAddress(''); setVendorCIF('');
    setConcept(''); setInvoiceNumber('');
    setCategory('otros'); setPhotoUrl('');
    setScanMsg(null); setAiResult(null);
    setDate(new Date().toISOString().split('T')[0]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !amount || parseFloat(amount) <= 0) {
      toast.error('Introduce un importe válido.');
      return;
    }
    setLoading(true);
    try {
      await addDoc(collection(db, 'tickets'), {
        userId: profile.uid,
        userName: profile.name,
        organizationId: profile.organizationId,
        date: Timestamp.fromDate(new Date(date + 'T12:00:00')),
        amount: parseFloat(amount),
        baseAmount: baseAmount ? parseFloat(baseAmount) : null,
        vatPercent: vatPercent ? parseFloat(vatPercent) : null,
        vatAmount: (baseAmount && vatPercent)
          ? Math.round(parseFloat(baseAmount) * parseFloat(vatPercent)) / 100
          : null,
        category,
        vendorName: vendorName.trim() || null,
        vendorAddress: vendorAddress.trim() || null,
        vendorCIF: vendorCIF.trim() || null,
        concept: concept.trim() || null,
        invoiceNumber: invoiceNumber.trim() || null,
        photoUrl: photoUrl || null,
        status: 'pending',
        description: concept.trim() || vendorName.trim() || null,
      });
      toast.success('Ticket registrado correctamente');
      setOpen(false);
      resetForm();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'tickets');
    } finally {
      setLoading(false);
    }
  };

  const selectedCat = TICKET_CATEGORIES.find(c => c.value === category);

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
      <DialogTrigger render={<Button variant="outline" className="gap-2 border-slate-200 hover:bg-slate-50 transition-all" />}>
        <Receipt className="w-4 h-4" /> Nuevo Ticket
      </DialogTrigger>
      <DialogContent className="sm:max-w-[520px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">Registrar Nuevo Ticket</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-2">

          {/* Capture buttons */}
          <div className="grid grid-cols-2 gap-3">
            <Button type="button" variant="outline"
              className="flex flex-col h-24 gap-2 rounded-3xl border-slate-200 hover:border-primary/40 hover:bg-slate-50 transition-all group"
              onClick={() => cameraInputRef.current?.click()}>
              <div className="p-2.5 bg-primary/10 rounded-2xl group-hover:scale-110 transition-transform">
                <Camera className="w-5 h-5 text-primary" />
              </div>
              <span className="text-xs font-bold">Cámara</span>
            </Button>
            <Button type="button" variant="outline"
              className="flex flex-col h-24 gap-2 rounded-3xl border-slate-200 hover:border-primary/40 hover:bg-slate-50 transition-all group"
              onClick={() => fileInputRef.current?.click()}>
              <div className="p-2.5 bg-indigo-50 rounded-2xl group-hover:scale-110 transition-transform">
                <Receipt className="w-5 h-5 text-indigo-600" />
              </div>
              <span className="text-xs font-bold">Galería</span>
            </Button>
          </div>
          <input type="file" accept="image/*" capture="environment" className="hidden" ref={cameraInputRef} onChange={handleFileChange} />
          <input type="file" accept="image/*" className="hidden" ref={fileInputRef} onChange={handleFileChange} />

          {/* Photo preview */}
          {photoUrl && (
            <div className="relative rounded-2xl overflow-hidden border border-slate-100 shadow-sm h-36">
              <img src={photoUrl} alt="Ticket" className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
              <div className="absolute bottom-2 left-3 flex items-center gap-1.5 text-white">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-[10px] font-bold uppercase tracking-widest">Foto capturada</span>
              </div>
              <button type="button" onClick={() => setPhotoUrl('')}
                className="absolute top-2 right-2 w-6 h-6 bg-black/50 hover:bg-black/70 rounded-full flex items-center justify-center text-white transition-colors">
                <X className="w-3 h-3" />
              </button>
            </div>
          )}

          {/* Scanning indicator */}
          {scanning && (
            <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-100 animate-pulse">
              <Loader2 className="w-5 h-5 animate-spin text-primary shrink-0" />
              <div>
                <p className="text-sm font-bold text-slate-700">Analizando ticket con IA...</p>
                <p className="text-xs text-slate-400">Extrayendo datos fiscales</p>
              </div>
            </div>
          )}

          {/* Scan result */}
          {scanMsg && !scanning && (
            <div className={`flex items-start gap-2 p-3 rounded-xl text-xs border ${
              scanMsg.type === 'success' ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-amber-50 border-amber-100 text-amber-700'
            }`}>
              {scanMsg.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" /> : <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />}
              <span>{scanMsg.text}</span>
            </div>
          )}

          {/* ── Fiscal data section ── */}
          <div className="space-y-3 p-4 bg-slate-50 rounded-2xl border border-slate-100">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5" /> Datos del Emisor
            </p>

            <div className="space-y-1.5">
              <Label className="text-[10px] font-semibold text-slate-500">Nombre del establecimiento</Label>
              <Input value={vendorName} onChange={e => setVendorName(e.target.value)}
                placeholder="Ej. Restaurante El Patio S.L." className="bg-white border-none text-sm" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[10px] font-semibold text-slate-500 flex items-center gap-1"><Hash className="w-3 h-3" /> CIF/NIF</Label>
                <Input value={vendorCIF} onChange={e => setVendorCIF(e.target.value)}
                  placeholder="B12345678" className="bg-white border-none font-mono text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] font-semibold text-slate-500 flex items-center gap-1"><FileText className="w-3 h-3" /> Nº Factura</Label>
                <Input value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)}
                  placeholder="FAC-2024-001" className="bg-white border-none font-mono text-sm" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] font-semibold text-slate-500 flex items-center gap-1"><MapPin className="w-3 h-3" /> Dirección</Label>
              <Input value={vendorAddress} onChange={e => setVendorAddress(e.target.value)}
                placeholder="Calle, nº, CP, Ciudad" className="bg-white border-none text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] font-semibold text-slate-500">Concepto</Label>
              <Input value={concept} onChange={e => setConcept(e.target.value)}
                placeholder="Ej. Comida de trabajo" className="bg-white border-none text-sm" />
            </div>
          </div>

          {/* ── Amount + date ── */}
          <div className="space-y-3 p-4 bg-slate-50 rounded-2xl border border-slate-100">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Importes</p>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[10px] font-semibold text-slate-500">Base imponible</Label>
                <Input type="number" step="0.01" value={baseAmount} onChange={e => setBaseAmount(e.target.value)}
                  placeholder="0.00" className="bg-white border-none font-mono text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] font-semibold text-slate-500">IVA %</Label>
                <Input type="number" step="1" value={vatPercent} onChange={e => setVatPercent(e.target.value)}
                  placeholder="21" className="bg-white border-none font-mono text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] font-semibold text-slate-500 text-primary font-bold">Total * (€)</Label>
                <Input type="number" step="0.01" min="0.01" required value={amount} onChange={e => setAmount(e.target.value)}
                  placeholder="0.00" className="bg-white border-none font-mono font-bold text-primary" />
              </div>
            </div>
          </div>

          {/* Category + date */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-[10px] font-bold uppercase text-slate-400">Categoría</Label>
              <Select value={category} onValueChange={v => setCategory(v as TicketCategory)}>
                <SelectTrigger className="bg-slate-50 border-none focus:ring-primary text-sm">
                  <SelectValue>{selectedCat ? `${selectedCat.emoji} ${selectedCat.label}` : 'Selecciona'}</SelectValue>
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  {TICKET_CATEGORIES.map(cat => (
                    <SelectItem key={cat.value} value={cat.value}>{cat.emoji} {cat.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="date" className="text-[10px] font-bold uppercase text-slate-400">Fecha</Label>
              <Input id="date" type="date" value={date} onChange={e => setDate(e.target.value)} required className="bg-slate-50 border-none focus-visible:ring-primary" />
            </div>
          </div>

          <Button type="submit" className="w-full h-12 text-base font-semibold shadow-lg shadow-primary/20" disabled={loading || scanning}>
            {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Guardando...</> : 'Guardar Ticket'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
