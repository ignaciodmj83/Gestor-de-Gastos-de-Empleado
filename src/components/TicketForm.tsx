import React, { useState, useRef } from 'react';
import { collection, addDoc, Timestamp } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, ai } from '@/src/lib/firebase';
import { useAuth } from './AuthProvider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { PlusCircle, Camera, Receipt, Sparkles, Loader2, AlertCircle, X } from 'lucide-react';
import { Type } from "@google/genai";
import { compressImage, toRawBase64 } from '@/src/lib/imageUtils';
import { TICKET_CATEGORIES, TicketCategory } from '@/src/types';

export function TicketForm() {
  const { profile } = useAuth();
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<TicketCategory>('otros');
  // FIXED: photoUrl now stores compressed data URL, not original
  const [photoUrl, setPhotoUrl] = useState('');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setScanError(null);
    setScanning(true);

    const reader = new FileReader();
    reader.onloadend = async () => {
      try {
        const originalDataUrl = reader.result as string;

        // FIXED: compress image before storing (Firestore 1MB limit)
        const compressedDataUrl = await compressImage(originalDataUrl);
        setPhotoUrl(compressedDataUrl);

        const rawBase64 = toRawBase64(compressedDataUrl);

        // Check API key
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey || apiKey === 'MY_GEMINI_API_KEY' || apiKey === '') {
          toast.warning('Sin clave Gemini — rellena los datos manualmente.');
          setScanning(false);
          return;
        }

        // FIXED: correct contents format for @google/genai v1.x
        const response = await ai.models.generateContent({
          model: 'gemini-1.5-flash-latest',
          contents: [
            {
              role: 'user',
              parts: [
                {
                  inlineData: {
                    mimeType: 'image/jpeg',
                    data: rawBase64,
                  },
                },
                {
                  text: `Analiza este ticket/factura de gasto. Extrae con precisión:
1. amount: importe total como número decimal (ej: 23.50). Si hay IVA incluido, usa el total con IVA.
2. date: fecha en formato YYYY-MM-DD. Si no hay fecha, usa la de hoy.
3. description: nombre del establecimiento o descripción corta (max 60 caracteres).
4. category: uno de estos valores exactos según el tipo de gasto: "comida", "transporte", "alojamiento", "combustible", "material_oficina", "otros".
Responde SOLO con JSON válido, sin texto adicional.`,
                },
              ],
            },
          ],
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                amount:      { type: Type.NUMBER },
                date:        { type: Type.STRING },
                description: { type: Type.STRING },
                category:    { type: Type.STRING },
              },
              required: ['amount', 'date', 'description', 'category'],
            },
          },
        });

        const text = response.text;
        if (!text) throw new Error('La IA no devolvió respuesta.');
        const data = JSON.parse(text.trim());

        if (data.amount != null && data.amount > 0) setAmount(String(data.amount));
        if (data.date) {
          const d = new Date(data.date);
          if (!isNaN(d.getTime())) setDate(data.date);
        }
        if (data.description) setDescription(data.description);
        if (data.category && TICKET_CATEGORIES.find(c => c.value === data.category)) {
          setCategory(data.category as TicketCategory);
        }

        toast.success('Ticket analizado con éxito ✨');
      } catch (error: any) {
        console.error('Error escaneando ticket:', error);
        const msg = error?.message?.includes('API_KEY')
          ? 'Clave de API no válida.'
          : error?.message || 'Error desconocido';
        setScanError(`No se pudo analizar el ticket: ${msg}`);
        toast.error('Error al escanear el ticket. Rellena los datos manualmente.');
      } finally {
        setScanning(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
        if (cameraInputRef.current) cameraInputRef.current.value = '';
      }
    };
    reader.readAsDataURL(file);
  };

  const resetForm = () => {
    setAmount(''); setDescription(''); setPhotoUrl('');
    setCategory('otros'); setScanError(null);
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
        category,
        // FIXED: only save photoUrl if we actually have one (no picsum placeholder)
        photoUrl: photoUrl || null,
        status: 'pending',
        description: description.trim(),
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
      <DialogTrigger>
        <Button variant="outline" className="gap-2 border-slate-200 hover:bg-slate-50 transition-all">
          <Receipt className="w-4 h-4" /> Nuevo Ticket
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">Registrar Nuevo Ticket</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-5 pt-4">

          {/* Photo capture buttons */}
          <div className="grid grid-cols-2 gap-4">
            <Button
              type="button"
              variant="outline"
              className="flex flex-col h-28 gap-3 rounded-3xl border-slate-200 hover:bg-slate-50 hover:border-primary/50 transition-all group"
              onClick={() => cameraInputRef.current?.click()}
            >
              <div className="p-3 bg-primary/10 rounded-2xl group-hover:scale-110 transition-transform">
                <Camera className="w-6 h-6 text-primary" />
              </div>
              <span className="text-xs font-bold">Cámara</span>
            </Button>
            <Button
              type="button"
              variant="outline"
              className="flex flex-col h-28 gap-3 rounded-3xl border-slate-200 hover:bg-slate-50 hover:border-primary/50 transition-all group"
              onClick={() => fileInputRef.current?.click()}
            >
              <div className="p-3 bg-indigo-50 rounded-2xl group-hover:scale-110 transition-transform">
                <Receipt className="w-6 h-6 text-indigo-600" />
              </div>
              <span className="text-xs font-bold">Galería</span>
            </Button>
          </div>

          {/* Photo preview */}
          {photoUrl && (
            <div className="relative rounded-2xl overflow-hidden border border-slate-100 shadow-sm aspect-video">
              <img src={photoUrl} alt="Ticket" className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
              <div className="absolute bottom-3 left-3 flex items-center gap-2 text-white">
                <Sparkles className="w-4 h-4 text-amber-400" />
                <span className="text-[10px] font-bold uppercase tracking-widest">Imagen capturada</span>
              </div>
              <button
                type="button"
                onClick={() => setPhotoUrl('')}
                className="absolute top-2 right-2 w-7 h-7 bg-black/40 hover:bg-black/60 rounded-full flex items-center justify-center text-white transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Scanning indicator */}
          {scanning && (
            <div className="flex items-center justify-center p-5 bg-slate-50 rounded-2xl border border-slate-100 animate-pulse">
              <Loader2 className="w-5 h-5 animate-spin text-primary mr-3" />
              <p className="text-sm font-bold text-slate-700 uppercase tracking-widest">IA Analizando...</p>
            </div>
          )}

          {/* Scan error */}
          {scanError && !scanning && (
            <div className="flex items-start gap-2 p-3 bg-amber-50 rounded-xl border border-amber-100 text-amber-700 text-xs">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{scanError}</span>
            </div>
          )}

          <input type="file" accept="image/*" capture="environment" className="hidden" ref={cameraInputRef} onChange={handleFileChange} />
          <input type="file" accept="image/*" className="hidden" ref={fileInputRef} onChange={handleFileChange} />

          {/* Category */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Categoría</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as TicketCategory)}>
              <SelectTrigger className="bg-slate-50 border-none focus:ring-primary">
                <SelectValue>
                  {selectedCat ? `${selectedCat.emoji} ${selectedCat.label}` : 'Selecciona categoría'}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                {TICKET_CATEGORIES.map(cat => (
                  <SelectItem key={cat.value} value={cat.value}>
                    {cat.emoji} {cat.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="date" className="text-xs font-semibold uppercase tracking-wider text-slate-500">Fecha</Label>
              <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required className="bg-slate-50 border-none focus-visible:ring-primary" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="amount" className="text-xs font-semibold uppercase tracking-wider text-slate-500">Importe (€) *</Label>
              <Input id="amount" type="number" step="0.01" min="0.01" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} required className="bg-slate-50 border-none focus-visible:ring-primary font-mono" />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="desc" className="text-xs font-semibold uppercase tracking-wider text-slate-500">Descripción</Label>
            <Input id="desc" placeholder="Ej. Comida con cliente" value={description} onChange={(e) => setDescription(e.target.value)} className="bg-slate-50 border-none focus-visible:ring-primary" />
          </div>

          <Button type="submit" className="w-full h-12 text-base font-semibold shadow-lg shadow-primary/20" disabled={loading || scanning}>
            {loading ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Guardando...</>
            ) : 'Guardar Ticket'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
