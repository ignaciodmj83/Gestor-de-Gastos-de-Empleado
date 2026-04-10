import React, { useState, useRef } from 'react';
import { collection, addDoc, Timestamp } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, ai } from '@/src/lib/firebase';
import { useAuth } from './AuthProvider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { PlusCircle, Camera, Loader2, ArrowRight, AlertCircle } from 'lucide-react';
import { Type } from "@google/genai";
import { compressImage, toRawBase64 } from '@/src/lib/imageUtils';

export function TripForm() {
  const { profile } = useAuth();
  const [km, setKm] = useState('');
  const [startKm, setStartKm] = useState('');
  const [endKm, setEndKm] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [description, setDescription] = useState('');
  // Photos stored as compressed data URLs (safe for Firestore)
  const [startPhoto, setStartPhoto] = useState('');
  const [endPhoto, setEndPhoto] = useState('');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState<'start' | 'end' | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);

  const startInputRef = useRef<HTMLInputElement>(null);
  const endInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>, type: 'start' | 'end') => {
    const file = e.target.files?.[0];
    if (!file) return;

    setScanError(null);
    setScanning(type);

    const reader = new FileReader();
    reader.onloadend = async () => {
      try {
        const originalDataUrl = reader.result as string;

        // FIXED: compress and use the compressed version for both storage AND Gemini
        const compressedDataUrl = await compressImage(originalDataUrl);
        const rawBase64 = toRawBase64(compressedDataUrl);

        // Save compressed image to state (safe size for Firestore)
        if (type === 'start') setStartPhoto(compressedDataUrl);
        else setEndPhoto(compressedDataUrl);

        // Check API key availability
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey || apiKey === 'MY_GEMINI_API_KEY' || apiKey === '') {
          toast.warning('Sin clave Gemini — introduce los km manualmente.');
          setScanning(null);
          return;
        }

        // FIXED: correct contents format for @google/genai v1.x
        const response = await ai.models.generateContent({
          model: "gemini-1.5-flash-latest",
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
                  text: 'Analiza esta foto de un odómetro de coche. Extrae ÚNICAMENTE el número total de kilómetros que marca como un número entero. Si no puedes leerlo con certeza, devuelve null.',
                },
              ],
            },
          ],
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                km: { type: Type.NUMBER, nullable: true },
              },
              required: ['km'],
            },
          },
        });

        const text = response.text;
        if (!text) throw new Error('La IA no devolvió ninguna respuesta.');
        const data = JSON.parse(text.trim());

        if (data.km != null && data.km > 0) {
          if (type === 'start') {
            setStartKm(String(data.km));
          } else {
            setEndKm(String(data.km));
            // Auto-calculate difference if start km is present
            const currentStartKm = type === 'end' ? parseFloat(startKm) : NaN;
            if (!isNaN(currentStartKm) && data.km > currentStartKm) {
              setKm(String(data.km - currentStartKm));
            }
          }
          toast.success(`Odómetro leído: ${data.km.toLocaleString('es-ES')} km`);
        } else {
          setScanError('No se pudo leer el odómetro. Introdúcelo manualmente.');
          toast.warning('No se pudo leer el odómetro automáticamente.');
        }
      } catch (error: any) {
        console.error('Error escaneando odómetro:', error);
        const msg = error?.message?.includes('API_KEY')
          ? 'Clave de API no válida.'
          : error?.message || 'Error desconocido';
        setScanError(`Error al leer odómetro: ${msg}`);
        toast.error(`Error al leer odómetro: ${msg}`);
      } finally {
        setScanning(null);
        // Reset input so same file can be re-selected
        if (type === 'start' && startInputRef.current) startInputRef.current.value = '';
        if (type === 'end' && endInputRef.current) endInputRef.current.value = '';
      }
    };
    reader.readAsDataURL(file);
  };

  // Recalculate km when endKm changes manually
  const handleEndKmChange = (val: string) => {
    setEndKm(val);
    const start = parseFloat(startKm);
    const end = parseFloat(val);
    if (!isNaN(start) && !isNaN(end) && end > start) {
      setKm(String(end - start));
    }
  };

  const resetForm = () => {
    setKm(''); setStartKm(''); setEndKm('');
    setStartPhoto(''); setEndPhoto('');
    setDescription(''); setScanError(null);
    setDate(new Date().toISOString().split('T')[0]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !km || parseFloat(km) <= 0) {
      toast.error('Introduce un valor de kilómetros válido.');
      return;
    }

    setLoading(true);
    try {
      await addDoc(collection(db, 'trips'), {
        userId: profile.uid,
        userName: profile.name,
        organizationId: profile.organizationId,
        date: Timestamp.fromDate(new Date(date + 'T12:00:00')),
        km: parseFloat(km),
        startKm: startKm ? parseFloat(startKm) : null,
        endKm: endKm ? parseFloat(endKm) : null,
        startPhotoUrl: startPhoto || null,
        endPhotoUrl: endPhoto || null,
        status: 'pending',
        description: description.trim(),
      });
      toast.success('Viaje registrado correctamente');
      setOpen(false);
      resetForm();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'trips');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
      <DialogTrigger>
        <Button className="gap-2 bg-slate-900 hover:bg-slate-800 shadow-lg shadow-slate-200 transition-all">
          <PlusCircle className="w-4 h-4" /> Nuevo Viaje
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">Registrar Nuevo Viaje</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-6 pt-4">
          <div className="space-y-4">
            {/* Odometer photos */}
            <div className="grid grid-cols-2 gap-4">
              {(['start', 'end'] as const).map((type) => {
                const photo = type === 'start' ? startPhoto : endPhoto;
                const label = type === 'start' ? 'Odómetro Inicio' : 'Odómetro Fin';
                const ref = type === 'start' ? startInputRef : endInputRef;
                return (
                  <div
                    key={type}
                    onClick={() => ref.current?.click()}
                    className="relative flex flex-col items-center justify-center gap-2 p-4 border-2 border-dashed rounded-2xl cursor-pointer hover:bg-slate-50 transition-all overflow-hidden aspect-square bg-slate-50/50"
                  >
                    {photo ? (
                      <img src={photo} alt={label} className="absolute inset-0 w-full h-full object-cover opacity-50" />
                    ) : (
                      <Camera className="w-6 h-6 text-slate-400" />
                    )}
                    <span className="text-[10px] font-bold uppercase tracking-widest relative z-10 text-slate-600 bg-white/70 px-1 rounded">{label}</span>
                    {scanning === type && (
                      <div className="absolute inset-0 bg-white/80 flex flex-col items-center justify-center z-20 gap-2">
                        <Loader2 className="w-6 h-6 animate-spin text-primary" />
                        <span className="text-[10px] font-bold uppercase text-slate-500">Analizando...</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <input type="file" accept="image/*" capture="environment" className="hidden" ref={startInputRef} onChange={(e) => handleFileChange(e, 'start')} />
            <input type="file" accept="image/*" capture="environment" className="hidden" ref={endInputRef} onChange={(e) => handleFileChange(e, 'end')} />

            {scanError && (
              <div className="flex items-start gap-2 p-3 bg-amber-50 rounded-xl border border-amber-100 text-amber-700 text-xs">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{scanError}</span>
              </div>
            )}

            {/* Km inputs */}
            <div className="grid grid-cols-3 gap-3 items-end">
              <div className="space-y-1">
                <Label className="text-[10px] font-bold uppercase text-slate-500">Inicio (km)</Label>
                <Input
                  type="number"
                  value={startKm}
                  onChange={(e) => setStartKm(e.target.value)}
                  placeholder="0"
                  className="h-9 font-mono text-xs"
                />
              </div>
              <div className="flex justify-center pb-2">
                <ArrowRight className="w-4 h-4 text-slate-300" />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] font-bold uppercase text-slate-500">Fin (km)</Label>
                <Input
                  type="number"
                  value={endKm}
                  onChange={(e) => handleEndKmChange(e.target.value)}
                  placeholder="0"
                  className="h-9 font-mono text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="date" className="text-xs font-semibold uppercase tracking-wider text-slate-500">Fecha</Label>
                <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required className="bg-slate-50 border-none focus-visible:ring-primary" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="km" className="text-xs font-semibold uppercase tracking-wider text-slate-500">KM Totales *</Label>
                <Input id="km" type="number" step="0.1" min="0.1" placeholder="0.0" value={km} onChange={(e) => setKm(e.target.value)} required className="bg-slate-50 border-none focus-visible:ring-primary font-mono text-lg font-bold text-primary" />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="desc" className="text-xs font-semibold uppercase tracking-wider text-slate-500">Descripción</Label>
              <Input id="desc" placeholder="Ej. Visita a cliente X" value={description} onChange={(e) => setDescription(e.target.value)} className="bg-slate-50 border-none focus-visible:ring-primary" />
            </div>
          </div>

          <Button type="submit" className="w-full h-12 text-base font-semibold shadow-lg shadow-primary/20" disabled={loading || !!scanning}>
            {loading ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Guardando...</>
            ) : 'Guardar Viaje'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
