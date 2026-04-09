import React, { useState, useRef } from 'react';
import { collection, addDoc, Timestamp } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, ai } from '@/src/lib/firebase';
import { useAuth } from './AuthProvider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { PlusCircle, Camera, Loader2, ArrowRight } from 'lucide-react';
import { Type } from "@google/genai";

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

  const startInputRef = useRef<HTMLInputElement>(null);
  const endInputRef = useRef<HTMLInputElement>(null);

  const compressImage = (base64Str: string): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.src = base64Str;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 1024;
        const MAX_HEIGHT = 1024;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.7).split(',')[1]);
      };
    });
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>, type: 'start' | 'end') => {
    const file = e.target.files?.[0];
    if (!file) return;

    setScanning(type);
    const reader = new FileReader();
    reader.onloadend = async () => {
      try {
        const base64Full = reader.result as string;
        const base64Data = await compressImage(base64Full);

        const response = await ai.models.generateContent({
          model: "gemini-flash-latest",
          contents: {
            parts: [
              {
                inlineData: {
                  mimeType: 'image/jpeg',
                  data: base64Data
                }
              },
              { text: "Analiza esta foto de un odómetro de coche. Extrae el número total de kilómetros que marca." }
            ]
          },
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                km: { type: Type.NUMBER }
              },
              required: ["km"]
            }
          }
        });

        const text = response.text;
        if (!text) throw new Error('La IA no devolvió ninguna respuesta.');
        const data = JSON.parse(text.trim());
        
        if (data.km) {
          if (type === 'start') {
            setStartKm(data.km.toString());
            setStartPhoto(base64Full);
          } else {
            setEndKm(data.km.toString());
            setEndPhoto(base64Full);
            
            // Auto calculate if start is present
            if (startKm) {
              const diff = data.km - parseFloat(startKm);
              if (diff > 0) setKm(diff.toString());
            }
          }
          toast.success('Kilometraje extraído con éxito');
        }
      } catch (error: any) {
        console.error('Error scanning odometer:', error);
        toast.error(`Error al leer odómetro: ${error.message || 'Error desconocido'}`);
        if (type === 'start') setStartPhoto(reader.result as string);
        else setEndPhoto(reader.result as string);
      } finally {
        setScanning(null);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !km) return;

    setLoading(true);
    try {
      await addDoc(collection(db, 'trips'), {
        userId: profile.uid,
        userName: profile.name,
        organizationId: profile.organizationId,
        date: Timestamp.fromDate(new Date(date)),
        km: parseFloat(km),
        startKm: startKm ? parseFloat(startKm) : null,
        endKm: endKm ? parseFloat(endKm) : null,
        startPhotoUrl: startPhoto || null,
        endPhotoUrl: endPhoto || null,
        status: 'pending',
        description,
      });
      toast.success('Viaje registrado correctamente');
      setOpen(false);
      setKm('');
      setStartKm('');
      setEndKm('');
      setStartPhoto('');
      setEndPhoto('');
      setDescription('');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'trips');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
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
            <div className="grid grid-cols-2 gap-4">
              <div 
                onClick={() => startInputRef.current?.click()}
                className="relative flex flex-col items-center justify-center gap-2 p-4 border-2 border-dashed rounded-2xl cursor-pointer hover:bg-slate-50 transition-all overflow-hidden aspect-square bg-slate-50/50"
              >
                {startPhoto ? (
                  <img src={startPhoto} alt="Inicio" className="absolute inset-0 w-full h-full object-cover opacity-40" />
                ) : (
                  <Camera className="w-6 h-6 text-slate-400" />
                )}
                <span className="text-[10px] font-bold uppercase tracking-widest relative z-10">Odómetro Inicio</span>
                {scanning === 'start' && (
                  <div className="absolute inset-0 bg-white/80 flex items-center justify-center z-20">
                    <Loader2 className="w-6 h-6 animate-spin text-primary" />
                  </div>
                )}
              </div>

              <div 
                onClick={() => endInputRef.current?.click()}
                className="relative flex flex-col items-center justify-center gap-2 p-4 border-2 border-dashed rounded-2xl cursor-pointer hover:bg-slate-50 transition-all overflow-hidden aspect-square bg-slate-50/50"
              >
                {endPhoto ? (
                  <img src={endPhoto} alt="Fin" className="absolute inset-0 w-full h-full object-cover opacity-40" />
                ) : (
                  <Camera className="w-6 h-6 text-slate-400" />
                )}
                <span className="text-[10px] font-bold uppercase tracking-widest relative z-10">Odómetro Fin</span>
                {scanning === 'end' && (
                  <div className="absolute inset-0 bg-white/80 flex items-center justify-center z-20">
                    <Loader2 className="w-6 h-6 animate-spin text-primary" />
                  </div>
                )}
              </div>
            </div>

            <input type="file" accept="image/*" capture="environment" className="hidden" ref={startInputRef} onChange={(e) => handleFileChange(e, 'start')} />
            <input type="file" accept="image/*" capture="environment" className="hidden" ref={endInputRef} onChange={(e) => handleFileChange(e, 'end')} />

            <div className="grid grid-cols-3 gap-3 items-end">
              <div className="space-y-1">
                <Label className="text-[10px] font-bold uppercase text-slate-500">Inicio</Label>
                <Input type="number" value={startKm} onChange={(e) => setStartKm(e.target.value)} placeholder="0" className="h-9 font-mono text-xs" />
              </div>
              <div className="flex justify-center pb-2">
                <ArrowRight className="w-4 h-4 text-slate-300" />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] font-bold uppercase text-slate-500">Fin</Label>
                <Input type="number" value={endKm} onChange={(e) => setEndKm(e.target.value)} placeholder="0" className="h-9 font-mono text-xs" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="date" className="text-xs font-semibold uppercase tracking-wider text-slate-500">Fecha</Label>
                <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required className="bg-slate-50 border-none focus-visible:ring-primary" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="km" className="text-xs font-semibold uppercase tracking-wider text-slate-500">KM Totales</Label>
                <Input id="km" type="number" step="0.1" placeholder="0.0" value={km} onChange={(e) => setKm(e.target.value)} required className="bg-slate-50 border-none focus-visible:ring-primary font-mono text-lg font-bold text-primary" />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="desc" className="text-xs font-semibold uppercase tracking-wider text-slate-500">Descripción</Label>
              <Input id="desc" placeholder="Ej. Visita a cliente X" value={description} onChange={(e) => setDescription(e.target.value)} className="bg-slate-50 border-none focus-visible:ring-primary" />
            </div>
          </div>
          
          <Button type="submit" className="w-full h-12 text-base font-semibold shadow-lg shadow-primary/20" disabled={loading || !!scanning}>
            {loading ? 'Guardando...' : 'Guardar Viaje'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
