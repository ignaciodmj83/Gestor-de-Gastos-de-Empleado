import React, { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot, orderBy } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '@/src/lib/firebase';
import { useAuth } from './AuthProvider';
import { Trip, Ticket } from '@/src/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { TripForm } from './TripForm';
import { TicketForm } from './TicketForm';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Car, Receipt, Clock, CheckCircle2, XCircle, TrendingUp, History } from 'lucide-react';

export function UserDashboard() {
  const { profile } = useAuth();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);

  useEffect(() => {
    if (!profile) return;

    const tripsQuery = query(
      collection(db, 'trips'),
      where('userId', '==', profile.uid),
      orderBy('date', 'desc')
    );

    const ticketsQuery = query(
      collection(db, 'tickets'),
      where('userId', '==', profile.uid),
      orderBy('date', 'desc')
    );

    const unsubTrips = onSnapshot(tripsQuery, (snapshot) => {
      setTrips(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Trip)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'trips'));

    const unsubTickets = onSnapshot(ticketsQuery, (snapshot) => {
      setTickets(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Ticket)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'tickets'));

    return () => {
      unsubTrips();
      unsubTickets();
    };
  }, [profile]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved': return <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-200 border-none px-3 py-1 rounded-full"><CheckCircle2 className="w-3 h-3 mr-1" /> Aprobado</Badge>;
      case 'rejected': return <Badge className="bg-rose-100 text-rose-700 hover:bg-rose-200 border-none px-3 py-1 rounded-full"><XCircle className="w-3 h-3 mr-1" /> Rechazado</Badge>;
      default: return <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-200 border-none px-3 py-1 rounded-full"><Clock className="w-3 h-3 mr-1" /> Pendiente</Badge>;
    }
  };

  return (
    <div className="space-y-8 pb-12">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
        <div className="space-y-1">
          <h2 className="text-3xl font-extrabold tracking-tight text-slate-900">Mis Registros</h2>
          <p className="text-slate-500">Gestiona tus viajes y tickets de gastos de forma eficiente.</p>
        </div>
        <div className="flex gap-3">
          <TripForm />
          <TicketForm />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="border-none shadow-sm shadow-slate-200/50 overflow-hidden group">
          <CardContent className="p-6 relative">
            <div className="absolute top-0 right-0 w-24 h-24 bg-blue-50 -mr-8 -mt-8 rounded-full opacity-50 group-hover:scale-110 transition-transform" />
            <div className="relative flex items-center gap-4">
              <div className="p-3 bg-blue-50 rounded-2xl">
                <Car className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Total Kilómetros</p>
                <p className="text-2xl font-black text-slate-900">
                  {trips.reduce((acc, trip) => acc + (trip.status === 'approved' ? trip.km : 0), 0).toFixed(1)} km
                </p>
                <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                  <TrendingUp className="w-3 h-3" /> Aprobados este mes
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="border-none shadow-sm shadow-slate-200/50 overflow-hidden group">
          <CardContent className="p-6 relative">
            <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-50 -mr-8 -mt-8 rounded-full opacity-50 group-hover:scale-110 transition-transform" />
            <div className="relative flex items-center gap-4">
              <div className="p-3 bg-emerald-50 rounded-2xl">
                <Receipt className="w-6 h-6 text-emerald-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Total Gastos</p>
                <p className="text-2xl font-black text-slate-900">
                  {tickets.reduce((acc, ticket) => acc + (ticket.status === 'approved' ? ticket.amount : 0), 0).toFixed(2)} €
                </p>
                <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                  <TrendingUp className="w-3 h-3" /> Aprobados este mes
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <History className="w-5 h-5 text-slate-400" />
          <h3 className="text-lg font-bold text-slate-900">Historial Reciente</h3>
        </div>

        <Tabs defaultValue="trips" className="w-full">
          <TabsList className="bg-white p-1 rounded-2xl border border-slate-100 shadow-sm mb-6">
            <TabsTrigger value="trips" className="rounded-xl px-6 py-2 data-[state=active]:bg-slate-900 data-[state=active]:text-white transition-all">Kilometraje</TabsTrigger>
            <TabsTrigger value="tickets" className="rounded-xl px-6 py-2 data-[state=active]:bg-slate-900 data-[state=active]:text-white transition-all">Tickets</TabsTrigger>
          </TabsList>
          
          <TabsContent value="trips">
            <Card className="border-none shadow-sm shadow-slate-200/50 overflow-hidden">
              <Table>
                <TableHeader className="bg-slate-50/50">
                  <TableRow>
                    <TableHead className="data-grid-header">Fecha</TableHead>
                    <TableHead className="data-grid-header">Distancia</TableHead>
                    <TableHead className="data-grid-header">Evidencia</TableHead>
                    <TableHead className="data-grid-header">Descripción</TableHead>
                    <TableHead className="data-grid-header">Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {trips.length === 0 ? (
                    <TableRow><TableCell colSpan={4} className="text-center py-12 text-slate-400">No hay viajes registrados</TableCell></TableRow>
                  ) : trips.map(trip => (
                    <TableRow key={trip.id} className="hover:bg-slate-50/50 transition-colors">
                      <TableCell className="data-grid-cell">{format(trip.date.toDate(), 'dd MMM yyyy', { locale: es })}</TableCell>
                      <TableCell className="data-grid-cell font-mono font-bold text-slate-900">{trip.km} km</TableCell>
                      <TableCell className="data-grid-cell">
                        <div className="flex gap-1">
                          {trip.startPhotoUrl && (
                            <Dialog>
                              <DialogTrigger>
                                <div className="w-8 h-8 rounded-lg overflow-hidden border border-slate-200 cursor-pointer hover:opacity-80 transition-opacity">
                                  <img src={trip.startPhotoUrl} alt="Inicio" className="w-full h-full object-cover" />
                                </div>
                              </DialogTrigger>
                              <DialogContent className="sm:max-w-[600px]">
                                <img src={trip.startPhotoUrl} alt="Odómetro Inicio" className="w-full h-auto rounded-xl" />
                              </DialogContent>
                            </Dialog>
                          )}
                          {trip.endPhotoUrl && (
                            <Dialog>
                              <DialogTrigger>
                                <div className="w-8 h-8 rounded-lg overflow-hidden border border-slate-200 cursor-pointer hover:opacity-80 transition-opacity">
                                  <img src={trip.endPhotoUrl} alt="Fin" className="w-full h-full object-cover" />
                                </div>
                              </DialogTrigger>
                              <DialogContent className="sm:max-w-[600px]">
                                <img src={trip.endPhotoUrl} alt="Odómetro Fin" className="w-full h-auto rounded-xl" />
                              </DialogContent>
                            </Dialog>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="data-grid-cell max-w-[200px] truncate text-slate-500">{trip.description || '-'}</TableCell>
                      <TableCell className="data-grid-cell">{getStatusBadge(trip.status)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>

          <TabsContent value="tickets">
            <Card className="border-none shadow-sm shadow-slate-200/50 overflow-hidden">
              <Table>
                <TableHeader className="bg-slate-50/50">
                  <TableRow>
                    <TableHead className="data-grid-header">Fecha</TableHead>
                    <TableHead className="data-grid-header">Importe</TableHead>
                    <TableHead className="data-grid-header">Foto</TableHead>
                    <TableHead className="data-grid-header">Descripción</TableHead>
                    <TableHead className="data-grid-header">Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tickets.length === 0 ? (
                    <TableRow><TableCell colSpan={4} className="text-center py-12 text-slate-400">No hay tickets registrados</TableCell></TableRow>
                  ) : tickets.map(ticket => (
                    <TableRow key={ticket.id} className="hover:bg-slate-50/50 transition-colors">
                      <TableCell className="data-grid-cell">{format(ticket.date.toDate(), 'dd MMM yyyy', { locale: es })}</TableCell>
                      <TableCell className="data-grid-cell font-mono font-bold text-slate-900">{ticket.amount.toFixed(2)} €</TableCell>
                      <TableCell className="data-grid-cell">
                        {ticket.photoUrl && (
                          <Dialog>
                            <DialogTrigger>
                              <div className="w-8 h-8 rounded-lg overflow-hidden border border-slate-200 cursor-pointer hover:opacity-80 transition-opacity">
                                <img src={ticket.photoUrl} alt="Ticket" className="w-full h-full object-cover" />
                              </div>
                            </DialogTrigger>
                            <DialogContent className="sm:max-w-[600px]">
                              <img src={ticket.photoUrl} alt="Ticket" className="w-full h-auto rounded-xl" />
                            </DialogContent>
                          </Dialog>
                        )}
                      </TableCell>
                      <TableCell className="data-grid-cell max-w-[200px] truncate text-slate-500">{ticket.description || '-'}</TableCell>
                      <TableCell className="data-grid-cell">{getStatusBadge(ticket.status)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
