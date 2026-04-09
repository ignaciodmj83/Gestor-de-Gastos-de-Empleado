import React, { useState } from 'react';
import { doc, setDoc, collection, addDoc, getDoc, query, where, getDocs } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '@/src/lib/firebase';
import { useAuth } from './AuthProvider';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';

export function OrganizationSetup() {
  const { user, refreshProfile } = useAuth();
  const [orgName, setOrgName] = useState('');
  const [orgIdToJoin, setOrgIdToJoin] = useState('');
  const [loading, setLoading] = useState(false);

  const createOrganization = async () => {
    if (!orgName || !user) return;
    setLoading(true);
    try {
      // 1. Create Organization
      const orgRef = await addDoc(collection(db, 'organizations'), {
        name: orgName,
        adminUid: user.uid,
      });

      // 2. Create User Profile as Admin
      await setDoc(doc(db, 'users', user.uid), {
        uid: user.uid,
        email: user.email || '',
        name: user.displayName || 'Usuario',
        organizationId: orgRef.id,
        role: 'admin',
      });

      toast.success('Organización creada con éxito');
      await refreshProfile();
    } catch (error: any) {
      console.error('Error creating organization:', error);
      if (error.code === 'permission-denied') {
        toast.error('Permiso denegado. Revisa las reglas de seguridad.');
      } else {
        toast.error('Error al crear organización: ' + error.message);
      }
      handleFirestoreError(error, OperationType.WRITE, 'organizations');
    } finally {
      setLoading(false);
    }
  };

  const joinOrganization = async () => {
    if (!orgIdToJoin || !user) return;
    setLoading(true);
    try {
      const orgDoc = await getDoc(doc(db, 'organizations', orgIdToJoin));
      if (!orgDoc.exists()) {
        toast.error('ID de organización no válido');
        return;
      }

      await setDoc(doc(db, 'users', user.uid), {
        uid: user.uid,
        email: user.email || '',
        name: user.displayName || 'Usuario',
        organizationId: orgIdToJoin,
        role: 'user',
      });

      toast.success('Te has unido a la organización');
      await refreshProfile();
    } catch (error: any) {
      console.error('Error joining organization:', error);
      if (error.code === 'permission-denied') {
        toast.error('Permiso denegado. Revisa las reglas de seguridad.');
      } else {
        toast.error('Error al unirse: ' + error.message);
      }
      handleFirestoreError(error, OperationType.WRITE, 'users');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen p-4 bg-gray-50">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Configuración de Organización</CardTitle>
          <CardDescription>
            Crea una nueva organización o únete a una existente para comenzar.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="create">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="create">Crear</TabsTrigger>
              <TabsTrigger value="join">Unirse</TabsTrigger>
            </TabsList>
            <TabsContent value="create" className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label htmlFor="orgName">Nombre de la Organización</Label>
                <Input 
                  id="orgName" 
                  placeholder="Ej. Mi Empresa S.L." 
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                />
              </div>
              <Button 
                onClick={createOrganization} 
                className="w-full" 
                disabled={loading || !orgName}
              >
                {loading ? 'Creando...' : 'Crear Organización'}
              </Button>
            </TabsContent>
            <TabsContent value="join" className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label htmlFor="orgId">ID de la Organización</Label>
                <Input 
                  id="orgId" 
                  placeholder="Pega el ID aquí" 
                  value={orgIdToJoin}
                  onChange={(e) => setOrgIdToJoin(e.target.value)}
                />
              </div>
              <Button 
                onClick={joinOrganization} 
                className="w-full" 
                disabled={loading || !orgIdToJoin}
              >
                {loading ? 'Uniéndose...' : 'Unirse'}
              </Button>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
