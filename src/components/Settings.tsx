import React, { useEffect, useState } from 'react';
import { doc, getDoc, setDoc, getDocs, writeBatch, collection, query, where } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '@/src/lib/firebase';
import { useAuth } from './AuthProvider';
import { OrgSettings, DEFAULT_SETTINGS } from '@/src/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
  DialogTrigger,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import {
  Loader2, Save, Building2, Mail, MapPin, Hash, Euro,
  Car, Wrench, AlertCircle, CheckCircle2, Copy, Trash2
} from 'lucide-react';

export function Settings() {
  const { profile, logout } = useAuth();
  const [settings, setSettings] = useState<OrgSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!profile?.organizationId) return;
    getDoc(doc(db, 'settings', profile.organizationId))
      .then(snap => {
        if (snap.exists()) {
          setSettings({ ...DEFAULT_SETTINGS, ...snap.data() as OrgSettings, organizationId: profile.organizationId });
        } else {
          setSettings({ ...DEFAULT_SETTINGS, organizationId: profile.organizationId });
        }
      })
      .catch(err => handleFirestoreError(err, OperationType.GET, 'settings'))
      .finally(() => setLoading(false));
  }, [profile?.organizationId]);

  const set = (key: keyof OrgSettings, value: string | number) => {
    setSaved(false);
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    if (!profile?.organizationId) return;
    setSaving(true);
    try {
      await setDoc(doc(db, 'settings', profile.organizationId), {
        ...settings,
        organizationId: profile.organizationId,
        kmCost: parseFloat(String(settings.kmCost)) || DEFAULT_SETTINGS.kmCost,
        maxAutoApproveAmount: parseFloat(String(settings.maxAutoApproveAmount)) || DEFAULT_SETTINGS.maxAutoApproveAmount,
      }, { merge: true });
      toast.success('Configuración guardada correctamente');
      setSaved(true);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'settings');
    } finally {
      setSaving(false);
    }
  };

  const copyOrgId = () => {
    if (profile?.organizationId) {
      navigator.clipboard.writeText(profile.organizationId);
      toast.success('ID de organización copiado');
    }
  };

  const deleteOrganization = async () => {
    if (!profile?.organizationId) return;
    setDeleting(true);
    try {
      const orgId = profile.organizationId;
      const batch = writeBatch(db);

      // Delete org document and settings document
      batch.delete(doc(db, 'organizations', orgId));
      batch.delete(doc(db, 'settings', orgId));

      // Clear organizationId and role from all org users
      const usersSnap = await getDocs(query(collection(db, 'users'), where('organizationId', '==', orgId)));
      usersSnap.forEach(userDoc => {
        batch.update(userDoc.ref, {
          organizationId: '',
          organizationName: '',
          role: 'user',
        });
      });

      // Delete all trips and tickets for the org
      const tripsSnap = await getDocs(query(collection(db, 'trips'), where('organizationId', '==', orgId)));
      tripsSnap.forEach(d => batch.delete(d.ref));

      const ticketsSnap = await getDocs(query(collection(db, 'tickets'), where('organizationId', '==', orgId)));
      ticketsSnap.forEach(d => batch.delete(d.ref));

      await batch.commit();
      toast.success('Organización eliminada');
      await logout();
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, 'organization');
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-12 max-w-2xl mx-auto">
      {/* Header */}
      <div className="space-y-1">
        <h2 className="text-3xl font-extrabold tracking-tight text-slate-900">Configuración</h2>
        <p className="text-slate-500">Parámetros de tu organización. Solo visibles para el administrador.</p>
      </div>

      {/* Org ID */}
      <Card className="border-none shadow-sm shadow-slate-200/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-bold flex items-center gap-2">
            <Building2 className="w-4 h-4 text-primary" /> Identificador de Organización
          </CardTitle>
          <CardDescription>Comparte este ID con tus empleados para que se unan.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs bg-slate-50 px-4 py-3 rounded-xl border border-slate-100 font-mono text-slate-700 truncate">
              {profile?.organizationId}
            </code>
            <Button size="sm" variant="outline" className="rounded-xl shrink-0" onClick={copyOrgId}>
              <Copy className="w-4 h-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Company fiscal data */}
      <Card className="border-none shadow-sm shadow-slate-200/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-bold flex items-center gap-2">
            <Building2 className="w-4 h-4 text-indigo-600" /> Datos Fiscales de la Empresa
          </CardTitle>
          <CardDescription>Se usan para generar facturas y PDFs de gastos.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5 col-span-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Nombre de la empresa</Label>
              <Input value={settings.companyName || ''} onChange={e => set('companyName', e.target.value)}
                placeholder="Mi Empresa S.L." className="bg-slate-50 border-none focus-visible:ring-primary" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1">
                <Hash className="w-3 h-3" /> CIF / NIF
              </Label>
              <Input value={settings.companyCIF || ''} onChange={e => set('companyCIF', e.target.value)}
                placeholder="B12345678" className="bg-slate-50 border-none focus-visible:ring-primary font-mono" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1">
                <Mail className="w-3 h-3" /> Email fiscal
              </Label>
              <Input type="email" value={settings.companyEmail || ''} onChange={e => set('companyEmail', e.target.value)}
                placeholder="admin@empresa.com" className="bg-slate-50 border-none focus-visible:ring-primary" />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1">
                <MapPin className="w-3 h-3" /> Dirección fiscal
              </Label>
              <Input value={settings.companyAddress || ''} onChange={e => set('companyAddress', e.target.value)}
                placeholder="Calle Mayor 1, 28001 Madrid" className="bg-slate-50 border-none focus-visible:ring-primary" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Km params */}
      <Card className="border-none shadow-sm shadow-slate-200/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-bold flex items-center gap-2">
            <Car className="w-4 h-4 text-blue-600" /> Parámetros de Kilometraje
          </CardTitle>
          <CardDescription>Se aplican al calcular el importe de los viajes.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1">
                <Euro className="w-3 h-3" /> Coste por km
              </Label>
              <div className="relative">
                <Input type="number" step="0.01" min="0.01" value={settings.kmCost}
                  onChange={e => set('kmCost', e.target.value)}
                  className="bg-slate-50 border-none focus-visible:ring-primary font-mono pr-12" />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-semibold">€/km</span>
              </div>
              <p className="text-xs text-slate-400">Referencia AEAT 2024: 0.26 €/km</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Moneda</Label>
              <Input value={settings.currency || 'EUR'} onChange={e => set('currency', e.target.value)}
                placeholder="EUR" className="bg-slate-50 border-none font-mono focus-visible:ring-primary" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Operational settings */}
      <Card className="border-none shadow-sm shadow-slate-200/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-bold flex items-center gap-2">
            <Wrench className="w-4 h-4 text-emerald-600" /> Parámetros Operativos
          </CardTitle>
          <CardDescription>Controla el flujo de aprobación de gastos.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5 col-span-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1">
                <Mail className="w-3 h-3" /> Email — Tickets pequeños (menor del umbral)
              </Label>
              <Input type="email" value={settings.emailTicketsSmall || ''} onChange={e => set('emailTicketsSmall', e.target.value)}
                placeholder="recuperacion-iva@empresa.com"
                className="bg-slate-50 border-none focus-visible:ring-primary" />
              <p className="text-xs text-slate-400">Destino para tickets con importe inferior al umbral de aprobación automática.</p>
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1">
                <Mail className="w-3 h-3" /> Email — Tickets grandes (igual o mayor al umbral)
              </Label>
              <Input type="email" value={settings.emailTicketsLarge || ''} onChange={e => set('emailTicketsLarge', e.target.value)}
                placeholder="contabilidad@empresa.com"
                className="bg-slate-50 border-none focus-visible:ring-primary" />
              <p className="text-xs text-slate-400">Destino para tickets que requieren revisión manual (importe elevado).</p>
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1">
                <Mail className="w-3 h-3" /> Email — Viajes / Kilometraje
              </Label>
              <Input type="email" value={settings.emailTrips || ''} onChange={e => set('emailTrips', e.target.value)}
                placeholder="kilometraje@empresa.com"
                className="bg-slate-50 border-none focus-visible:ring-primary" />
              <p className="text-xs text-slate-400">Destino para el envío de registros de viajes y kilometraje.</p>
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Importe máximo para aprobación automática
              </Label>
              <div className="relative">
                <Input type="number" step="1" min="0" value={settings.maxAutoApproveAmount}
                  onChange={e => set('maxAutoApproveAmount', e.target.value)}
                  className="bg-slate-50 border-none focus-visible:ring-primary font-mono pr-8" />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-semibold">€</span>
              </div>
              <p className="text-xs text-slate-400">
                Tickets con importe inferior se procesan automáticamente a recuperación de IVA.
              </p>
            </div>
          </div>

          {/* Info box */}
          <div className="flex items-start gap-2.5 p-3 bg-blue-50 rounded-xl border border-blue-100 text-xs text-blue-700">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              Los cambios de configuración se aplican a los <strong>nuevos registros</strong>.
              Los registros ya enviados conservan los parámetros del momento de su creación.
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Save button */}
      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={saving} className="gap-2 h-12 px-8 rounded-xl shadow-lg shadow-primary/20 text-base font-semibold">
          {saving
            ? <><Loader2 className="w-4 h-4 animate-spin" /> Guardando...</>
            : saved
              ? <><CheckCircle2 className="w-4 h-4" /> Guardado</>
              : <><Save className="w-4 h-4" /> Guardar configuración</>
          }
        </Button>
        {saved && <span className="text-sm text-emerald-600 font-medium">✓ Cambios guardados</span>}
      </div>

      {/* Danger zone */}
      <Card className="border border-red-200 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-bold flex items-center gap-2 text-red-600">
            <Trash2 className="w-4 h-4" /> Zona peligrosa
          </CardTitle>
          <CardDescription>Acciones irreversibles. Procede con precaución.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-start justify-between gap-4 p-4 bg-red-50 rounded-xl border border-red-100">
            <div>
              <p className="text-sm font-semibold text-slate-800">Eliminar organización</p>
              <p className="text-xs text-slate-500 mt-0.5">
                Elimina permanentemente la organización, toda su configuración y todos los datos de gastos y viajes. Esta acción no se puede deshacer.
              </p>
            </div>
            <Dialog>
              <DialogTrigger render={
                <Button variant="outline" className="shrink-0 border-red-300 text-red-600 hover:bg-red-50 hover:text-red-700 gap-2" />
              }>
                <Trash2 className="w-4 h-4" /> Eliminar
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 text-red-600">
                    <Trash2 className="w-5 h-5" /> Confirmar eliminación
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-3 py-2">
                  <div className="flex items-start gap-2.5 p-3 bg-red-50 rounded-xl border border-red-100 text-xs text-red-700">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>
                      Esta acción es <strong>permanente e irreversible</strong>. Se eliminarán:
                      <ul className="mt-1.5 list-disc pl-4 space-y-0.5">
                        <li>La organización y su configuración</li>
                        <li>Todos los tickets y viajes registrados</li>
                        <li>La vinculación de todos los empleados</li>
                      </ul>
                    </span>
                  </div>
                  <p className="text-sm text-slate-600">¿Estás seguro de que quieres eliminar la organización <strong>{settings.companyName || profile?.organizationId}</strong>?</p>
                </div>
                <DialogFooter>
                  <DialogClose render={<Button variant="outline" />}>
                    Cancelar
                  </DialogClose>
                  <Button
                    onClick={deleteOrganization}
                    disabled={deleting}
                    className="gap-2 bg-red-600 hover:bg-red-700 text-white"
                  >
                    {deleting
                      ? <><Loader2 className="w-4 h-4 animate-spin" /> Eliminando...</>
                      : <><Trash2 className="w-4 h-4" /> Sí, eliminar</>
                    }
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
