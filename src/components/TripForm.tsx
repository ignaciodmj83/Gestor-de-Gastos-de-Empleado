import React, { useState, useRef, useEffect } from 'react';
import { collection, addDoc, Timestamp, doc, getDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '@/src/lib/firebase';
import { useAuth } from './AuthProvider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { PlusCircle, Camera, Loader2, ArrowRight, AlertCircle, CheckCircle2, Fuel } from 'lucide-react';
import { compressImage, toRawBase64 } from '@/src/lib/imageUtils';
import { readOdometer, OdometerResult } from '@/src/lib/gemini';
import { OrgSettings, DEFAULT_SETTINGS } from '@/src/types';

export function TripForm() {
  const { profile } = useAuth();
  const [km, setKm] = useState('');
  const [startKm, setStartKm] = useState('');
  const [endKm, setEndKm] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [description, setDescription] = useState('');
  const [startPhoto, setStartPhoto] = useState('');
  const [endPhoto, setEndPhoto] = useState('');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState<'start' | 'end' | null>(null);
  const [scanMsg, setScanMsg] = useState<{ type: 'error' | 'success'; text: string } | null>(null);
  const [orgSettings, setOrgSettings] = useState<OrgSettings>(DEFAULT_SETTINGS);

  const startInputRef = useRef<HTMLInputElement>(null);
  const endInputRef = useRef<HTMLInputElement>(null);

  // Load org settings to get km cost
  useEffect(() => {
    if (!profile?.organizationId) return;
    getDoc(doc(db, 'settings', profile.organizationId)).then(snap => {
      if (snap.exists()) setOrgSettings({ ...DEFAULT_SETTINGS, ...snap.data() } as OrgSettings);
    }).catch(() => {});
  }, [profile?.organizationId]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>, type: 'start' | 'end') => {
    const file = e.target.files?.[0];
    if (!file) return;

    setScanMsg(null);
    setScanning(type);

    try {
      const reader = new FileReader();
      const dataUrl = await new Promise<string>((res, rej) => {
        reader.onloadend = () => res(reader.result as string);
        reader.onerror = rej;
        reader.readAsDataURL(file);
      });

      // Compress for storage + API
      const compressed = await compressImage(dataUrl);
      const raw = toRawBase64(compressed);

      // Save compressed photo immediately so user sees it
      if (type === 'start') setStartPhoto(compressed);
      else setEndPhoto(compressed);

      // Call Gemini
      let result: OdometerResult;
      try {
        result = await readOdometer(raw);
      } catch (geminiErr: any) {
        const msg = geminiErr?.message || 'Error de IA';
        setScanMsg({ type: 'error', text: `No se pudo leer el odómetro automáticamente: ${msg}. Introduce el valor manualmente.` });
        return;
      }

      if (result.km != null && result.km > 0) {
        if (type === 'start') {
          setStartKm(String(result.km));
        } else {
          setEndKm(String(result.km));
          const start = parseFloat(startKm);
          if (!isNaN(start) && result.km > start) {
            setKm(String(result.km - start));
          }
        }
        const conf = result.confidence === 'high' ? '✓ Alta confianza' : result.confidence === 'medium' ? '~ Confianza media' : '⚠ Baja confianza';
        setScanMsg({ type: 'success', text: `Odómetro leído: ${result.km.toLocaleString('es-ES')} km (${conf})${result.rawText ? ` · "${result.rawText}"` : ''}` });
        toast.success(`Odómetro ${type === 'start' ? 'inicial' : 'final'}: ${result.km.toLocaleString('es-ES')} km`);
      } else {
        setScanMsg({ type: 'error', text: `No se pudo leer el odómetro (confianza: ${result.confidence}). Introduce el valor manualmente.` });
      }
    } catch (err: any) {
      setScanMsg({ type: 'error', text: `Error al procesar imagen: ${err?.message || 'Error desconocido'}` });
      toast.error('Error al procesar la imagen');
    } finally {
      setScanning(null);
      if (type === 'start' && startInputRef.current) startInputRef.current.value = '';
      if (type === 'end' && endInputRef.current) endInputRef.current.value = '';
    }
  };

  const handleEndKmChange = (val: string) => {
    setEndKm(val);
    const start = parseFloat(startKm);
    const end = parseFloat(val);
    if (!isNaN(start) && !isNaN(end) && end > start) {
      setKm(String(Math.round((end - start) * 10) / 10));
    }
  };

  const totalAmount = km && orgSettings.kmCost ? parseFloat(km) * orgSettings.kmCost : null;

  const resetForm = () => {
    setKm(''); setStartKm(''); setEndKm('');
    setStartPhoto(''); setEndPhoto('');
    setDescription(''); setScanMsg(null);
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
        kmCost: orgSettings.kmCost,
        totalAmount: totalAmount ?? parseFloat(km) * orgSettings.kmCost,
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
      <DialogTrigger render={<Button className="gap-2 bg-slate-900 hover:bg-slate-800 shadow-lg shadow-slate-200 transition-all" />}>
        <PlusCircle className="w-4 h-4" /> Nuevo Viaje
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">Registrar Nuevo Viaje</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-5 pt-2">

          {/* Odometer photo pickers */}
          <div className="grid grid-cols-2 gap-3">
            {(['start', 'end'] as const).map((type) => {
              const photo = type === 'start' ? startPhoto : endPhoto;
              const label = type === 'start' ? 'Odómetro Inicio' : 'Odómetro Fin';
              const kmVal = type === 'start' ? startKm : endKm;
              const ref = type === 'start' ? startInputRef : endInputRef;
              return (
                <div
                  key={type}
                  onClick={() => ref.current?.click()}
                  className="relative flex flex-col items-center justify-center gap-2 p-4 border-2 border-dashed border-slate-200 rounded-2xl cursor-pointer hover:border-primary/40 hover:bg-slate-50 transition-all overflow-hidden aspect-square bg-slate-50/50"
                >
                  {photo && (
                    <img src={photo} alt={label} className="absolute inset-0 w-full h-full object-cover opacity-40 rounded-2xl" />
                  )}
                  {!photo && <Camera className="w-7 h-7 text-slate-300" />}
                  <span className="relative z-10 text-[10px] font-bold uppercase tracking-widest text-slate-500 bg-white/80 px-2 py-0.5 rounded-lg">
                    {label}
                  </span>
                  {kmVal && (
                    <span className="relative z-10 text-xs font-mono font-bold text-primary bg-white/90 px-2 py-0.5 rounded-lg">
                      {parseInt(kmVal).toLocaleString('es-ES')} km
                    </span>
                  )}
                  {scanning === type && (
                    <div className="absolute inset-0 bg-white/85 flex flex-col items-center justify-center z-20 gap-2 rounded-2xl">
                      <Loader2 className="w-6 h-6 animate-spin text-primary" />
                      <span className="text-[10px] font-bold uppercase text-slate-500">IA leyendo...</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <input type="file" accept="image/*" capture="environment" className="hidden" ref={startInputRef} onChange={(e) => handleFileChange(e, 'start')} />
          <input type="file" accept="image/*" capture="environment" className="hidden" ref={endInputRef} onChange={(e) => handleFileChange(e, 'end')} />

          {/* Scan feedback */}
          {scanMsg && (
            <div className={`flex items-start gap-2 p-3 rounded-xl text-xs border ${
              scanMsg.type === 'success'
                ? 'bg-emerald-50 border-emerald-100 text-emerald-700'
                : 'bg-amber-50 border-amber-100 text-amber-700'
            }`}>
              {scanMsg.type === 'success'
                ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
                : <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />}
              <span>{scanMsg.text}</span>
            </div>
          )}

          {/* Km inputs */}
          <div className="grid grid-cols-3 gap-3 items-end">
            <div className="space-y-1.5">
              <Label className="text-[10px] font-bold uppercase text-slate-400">Inicio (km)</Label>
              <Input type="number" value={startKm} onChange={e => setStartKm(e.target.value)} placeholder="0" className="h-9 font-mono text-sm bg-slate-50 border-none" />
            </div>
            <div className="flex justify-center pb-2">
              <ArrowRight className="w-4 h-4 text-slate-300" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] font-bold uppercase text-slate-400">Fin (km)</Label>
              <Input type="number" value={endKm} onChange={e => handleEndKmChange(e.target.value)} placeholder="0" className="h-9 font-mono text-sm bg-slate-50 border-none" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="date" className="text-[10px] font-bold uppercase text-slate-400">Fecha</Label>
              <Input id="date" type="date" value={date} onChange={e => setDate(e.target.value)} required className="bg-slate-50 border-none focus-visible:ring-primary" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="km" className="text-[10px] font-bold uppercase text-slate-400">KM Totales *</Label>
              <Input id="km" type="number" step="0.1" min="0.1" placeholder="0.0" value={km}
                onChange={e => setKm(e.target.value)} required
                className="bg-slate-50 border-none focus-visible:ring-primary font-mono text-lg font-bold text-primary" />
            </div>
          </div>

          {/* Cost preview */}
          {totalAmount != null && totalAmount > 0 && (
            <div className="flex items-center justify-between px-4 py-3 bg-indigo-50 rounded-2xl border border-indigo-100">
              <div className="flex items-center gap-2 text-indigo-700">
                <Fuel className="w-4 h-4" />
                <span className="text-sm font-semibold">Importe estimado</span>
              </div>
              <div className="text-right">
                <span className="text-lg font-black text-indigo-700">{totalAmount.toFixed(2)} €</span>
                <p className="text-[10px] text-indigo-400">{km} km × {orgSettings.kmCost} €/km</p>
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="desc" className="text-[10px] font-bold uppercase text-slate-400">Descripción / Destino</Label>
            <Input id="desc" placeholder="Ej. Visita cliente – Polígono Industrial Norte" value={description}
              onChange={e => setDescription(e.target.value)} className="bg-slate-50 border-none focus-visible:ring-primary" />
          </div>

          <Button type="submit" className="w-full h-12 text-base font-semibold shadow-lg shadow-primary/20" disabled={loading || !!scanning}>
            {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Guardando...</> : 'Guardar Viaje'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
