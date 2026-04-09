import React, { useState, useRef } from 'react';
import { collection, addDoc, Timestamp } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, ai } from '@/src/lib/firebase';
import { useAuth } from './AuthProvider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { PlusCircle, Camera, Receipt, Sparkles, Loader2 } from 'lucide-react';
import { Type } from "@google/genai";

export function TicketForm() {
  const { profile } = useAuth();
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [description, setDescription] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

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

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setScanning(true);
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
              { text: "Analiza este ticket de gasto. Extrae: 1. El importe total (amount) como número. 2. La fecha (date) en formato YYYY-MM-DD. 3. El nombre del establecimiento (description). Si no encuentras algún dato, usa valores por defecto (0 para importe, fecha de hoy para fecha)." }
            ]
          },
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                amount: { type: Type.NUMBER },
                date: { type: Type.STRING },
                description: { type: Type.STRING }
              },
              required: ["amount", "date", "description"]
            }
          }
        });

        const text = response.text;
        if (!text) throw new Error('La IA no devolvió ninguna respuesta.');

        const data = JSON.parse(text.trim());

        if (data.amount !== undefined) setAmount(data.amount.toString());
        if (data.date) {
          const d = new Date(data.date);
          if (!isNaN(d.getTime())) setDate(data.date);
        }
        if (data.description) setDescription(data.description);
        
        setPhotoUrl(base64Full);
        toast.success('Ticket analizado con éxito');
      } catch (error: any) {
        console.error('Error scanning ticket:', error);
        toast.error(`Error al escanear: ${error.message || 'Error desconocido'}`);
      } finally {
        setScanning(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
        if (cameraInputRef.current) cameraInputRef.current.value = '';
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !amount) return;

    setLoading(true);
    try {
      await addDoc(collection(db, 'tickets'), {
        userId: profile.uid,
        userName: profile.name,
        organizationId: profile.organizationId,
        date: Timestamp.fromDate(new Date(date)),
        amount: parseFloat(amount),
        photoUrl: photoUrl || `https://picsum.photos/seed/${Math.random()}/400/300`,
        status: 'pending',
        description,
      });
      toast.success('Ticket registrado correctamente');
      setOpen(false);
      setAmount('');
      setDescription('');
      setPhotoUrl('');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'tickets');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger>
        <Button variant="outline" className="gap-2 border-slate-200 hover:bg-slate-50 transition-all">
          <Receipt className="w-4 h-4" /> Nuevo Ticket
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">Registrar Nuevo Ticket</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-6 pt-4">
          <div className="space-y-4">
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

            {photoUrl && (
              <div className="relative rounded-2xl overflow-hidden border border-slate-100 shadow-sm aspect-video">
                <img src={photoUrl} alt="Ticket" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
                <div className="absolute bottom-3 left-3 flex items-center gap-2 text-white">
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  <span className="text-[10px] font-bold uppercase tracking-widest">Imagen capturada</span>
                </div>
              </div>
            )}

            {scanning && (
              <div className="flex items-center justify-center p-6 bg-slate-50 rounded-2xl border border-slate-100 animate-pulse">
                <div className="flex items-center gap-4">
                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                  <p className="text-sm font-black text-slate-700 uppercase tracking-widest">
                    IA Analizando...
                  </p>
                </div>
              </div>
            )}

            <input 
              type="file" 
              accept="image/*" 
              capture="environment"
              className="hidden" 
              ref={cameraInputRef} 
              onChange={handleFileChange}
            />
            <input 
              type="file" 
              accept="image/*" 
              className="hidden" 
              ref={fileInputRef} 
              onChange={handleFileChange}
            />

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="date" className="text-xs font-semibold uppercase tracking-wider text-slate-500">Fecha</Label>
                <Input 
                  id="date" 
                  type="date" 
                  value={date} 
                  onChange={(e) => setDate(e.target.value)} 
                  required 
                  className="bg-slate-50 border-none focus-visible:ring-primary"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="amount" className="text-xs font-semibold uppercase tracking-wider text-slate-500">Importe (€)</Label>
                <Input 
                  id="amount" 
                  type="number" 
                  step="0.01" 
                  placeholder="0.00" 
                  value={amount} 
                  onChange={(e) => setAmount(e.target.value)} 
                  required 
                  className="bg-slate-50 border-none focus-visible:ring-primary font-mono"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="desc" className="text-xs font-semibold uppercase tracking-wider text-slate-500">Descripción</Label>
              <Input 
                id="desc" 
                placeholder="Ej. Comida con cliente" 
                value={description} 
                onChange={(e) => setDescription(e.target.value)} 
                className="bg-slate-50 border-none focus-visible:ring-primary"
              />
            </div>
          </div>
          
          <Button type="submit" className="w-full h-12 text-base font-semibold shadow-lg shadow-primary/20" disabled={loading || scanning}>
            {loading ? 'Guardando...' : 'Guardar Ticket'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
