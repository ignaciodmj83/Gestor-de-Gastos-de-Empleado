import React, { useState } from 'react';
import { doc, setDoc, collection, addDoc, getDoc } from 'firebase/firestore';
import { db, OperationType } from '@/src/lib/firebase';
import { useAuth } from './AuthProvider';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { Building2, Users, Copy } from 'lucide-react';

export function OrganizationSetup() {
  const { user, refreshProfile } = useAuth();
  const [orgName, setOrgName] = useState('');
  const [orgIdToJoin, setOrgIdToJoin] = useState('');
  const [createdOrgId, setCreatedOrgId] = useState('');
  const [loading, setLoading] = useState(false);

  const createOrganization = async () => {
    if (!orgName.trim() || !user) return;
    setLoading(true);
    try {
      const orgRef = await addDoc(collection(db, 'organizations'), {
        name: orgName.trim(),
        adminUid: user.uid,
      });

      await setDoc(doc(db, 'users', user.uid), {
        uid: user.uid,
        email: user.email || '',
        name: user.displayName || 'Usuario',
        organizationId: orgRef.id,
        role: 'admin',
      });

      setCreatedOrgId(orgRef.id);
      toast.success('¡Organización creada con éxito! Comparte el ID con tu equipo.');
      await refreshProfile();
    } catch (error: any) {
      console.error('Error creating organization:', error);
      // FIXED: no longer calling handleFirestoreError which would throw again
      if (error.code === 'permission-denied') {
        toast.error('Permiso denegado. Revisa las reglas de seguridad de Firestore.');
      } else {
        toast.error('Error al crear organización: ' + (error.message || 'Error desconocido'));
      }
    } finally {
      setLoading(false);
    }
  };

  const joinOrganization = async () => {
    if (!orgIdToJoin.trim() || !user) return;
    setLoading(true);
    try {
      const orgDoc = await getDoc(doc(db, 'organizations', orgIdToJoin.trim()));
      if (!orgDoc.exists()) {
        toast.error('ID de organización no válido. Comprueba que sea correcto.');
        setLoading(false);
        return;
      }

      await setDoc(doc(db, 'users', user.uid), {
        uid: user.uid,
        email: user.email || '',
        name: user.displayName || 'Usuario',
        organizationId: orgIdToJoin.trim(),
        role: 'user',
      });

      toast.success(`Te has unido a "${orgDoc.data().name}" correctamente.`);
      await refreshProfile();
    } catch (error: any) {
      console.error('Error joining organization:', error);
      if (error.code === 'permission-denied') {
        toast.error('Permiso denegado. Contacta con el administrador.');
      } else {
        toast.error('Error al unirse: ' + (error.message || 'Error desconocido'));
      }
    } finally {
      setLoading(false);
    }
  };

  const copyOrgId = () => {
    navigator.clipboard.writeText(createdOrgId);
    toast.success('ID copiado al portapapeles');
  };

  return (
    <div className="flex items-center justify-center min-h-screen p-4 bg-slate-50">
      <Card className="w-full max-w-md shadow-lg border-none">
        <CardHeader className="text-center pb-4">
          <div className="mx-auto bg-primary w-12 h-12 rounded-xl flex items-center justify-center mb-3">
            <Building2 className="w-6 h-6 text-white" />
          </div>
          <CardTitle className="text-2xl font-extrabold">Configurar Organización</CardTitle>
          <CardDescription>
            Crea una nueva organización o únete a una existente para comenzar.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="create">
            <TabsList className="grid w-full grid-cols-2 rounded-2xl bg-slate-100 p-1 mb-4">
              <TabsTrigger value="create" className="rounded-xl">
                <Building2 className="w-3.5 h-3.5 mr-1.5" /> Crear
              </TabsTrigger>
              <TabsTrigger value="join" className="rounded-xl">
                <Users className="w-3.5 h-3.5 mr-1.5" /> Unirse
              </TabsTrigger>
            </TabsList>

            <TabsContent value="create" className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="orgName" className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Nombre de la Organización
                </Label>
                <Input
                  id="orgName"
                  placeholder="Ej. Mi Empresa S.L."
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  className="bg-slate-50 border-none focus-visible:ring-primary"
                  onKeyDown={(e) => e.key === 'Enter' && createOrganization()}
                />
              </div>
              <Button onClick={createOrganization} className="w-full rounded-xl h-11" disabled={loading || !orgName.trim()}>
                {loading ? 'Creando...' : 'Crear Organización'}
              </Button>
              {createdOrgId && (
                <div className="mt-3 p-4 bg-emerald-50 rounded-2xl border border-emerald-100">
                  <p className="text-xs font-semibold text-emerald-700 mb-2">
                    ✓ ID para compartir con tu equipo:
                  </p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-xs bg-white px-3 py-2 rounded-xl border border-emerald-200 font-mono text-emerald-800 truncate">
                      {createdOrgId}
                    </code>
                    <Button size="sm" variant="outline" className="rounded-xl border-emerald-200 text-emerald-700 hover:bg-emerald-100" onClick={copyOrgId}>
                      <Copy className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              )}
            </TabsContent>

            <TabsContent value="join" className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="orgId" className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  ID de la Organización
                </Label>
                <Input
                  id="orgId"
                  placeholder="Pega el ID aquí"
                  value={orgIdToJoin}
                  onChange={(e) => setOrgIdToJoin(e.target.value)}
                  className="bg-slate-50 border-none focus-visible:ring-primary font-mono text-sm"
                  onKeyDown={(e) => e.key === 'Enter' && joinOrganization()}
                />
                <p className="text-xs text-slate-400">El ID te lo facilita el administrador de tu empresa.</p>
              </div>
              <Button onClick={joinOrganization} className="w-full rounded-xl h-11" disabled={loading || !orgIdToJoin.trim()}>
                {loading ? 'Uniéndose...' : 'Unirse a la Organización'}
              </Button>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
