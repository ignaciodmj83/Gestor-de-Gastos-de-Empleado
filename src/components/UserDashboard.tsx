import React, { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot, orderBy } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '@/src/lib/firebase';
import { useAuth } from './AuthProvider';
import { Trip, Ticket, TICKET_CATEGORIES } from '@/src/types';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { TripForm } from './TripForm';
import { TicketForm } from './TicketForm';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Car, Receipt, Clock, CheckCircle2, XCircle, TrendingUp, History, ImageOff } from 'lucide-react';

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

    const unsubTrips = onSnapshot(tripsQuery,
      (snap) => setTrips(snap.docs.map(d => ({ id: d.id, ...d.data() } as Trip))),
      (err) => handleFirestoreError(err, OperationType.LIST, 'trips')
    );
    const unsubTickets = onSnapshot(ticketsQuery,
      (snap) => setTickets(snap.docs.map(d => ({ id: d.id, ...d.data() } as Ticket))),
      (err) => handleFirestoreError(err, OperationType.LIST, 'tickets')
    );

    return () => { unsubTrips(); unsubTickets(); };
  }, [profile]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved': return <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-200 border-none px-3 py-1 rounded-full"><CheckCircle2 className="w-3 h-3 mr-1" />Aprobado</Badge>;
      case 'rejected': return <Badge className="bg-rose-100 text-rose-700 hover:bg-rose-200 border-none px-3 py-1 rounded-full"><XCircle className="w-3 h-3 mr-1" />Rechazado</Badge>;
      default:         return <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-200 border-none px-3 py-1 rounded-full"><Clock className="w-3 h-3 mr-1" />Pendiente</Badge>;
    }
  };

  // FIXED: filter by current month for monthly stats
  const now = new Date();
  const thisMonthTrips   = trips.filter(t => { const d = t.date.toDate(); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); });
  const thisMonthTickets = tickets.filter(t => { const d = t.date.toDate(); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); });

  const approvedKmThisMonth    = thisMonthTrips.filter(t => t.status === 'approved').reduce((acc, t) => acc + t.km, 0);
  const approvedAmountThisMonth = thisMonthTickets.filter(t => t.status === 'approved').reduce((acc, t) => acc + t.amount, 0);
  const pendingCount = trips.filter(t => t.status === 'pending').length + tickets.filter(t => t.status === 'pending').length;

  const monthLabel = format(now, 'MMMM yyyy', { locale: es });

  return (
    <div className="space-y-8 pb-12">
      {/* Header */}
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

      {/* Stats cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="border-none shadow-sm shadow-slate-200/50 overflow-hidden group">
          <CardContent className="p-6 relative">
            <div className="absolute top-0 right-0 w-24 h-24 bg-blue-50 -mr-8 -mt-8 rounded-full opacity-50 group-hover:scale-110 transition-transform" />
            <div className="relative flex items-center gap-4">
              <div className="p-3 bg-blue-50 rounded-2xl"><Car className="w-6 h-6 text-blue-600" /></div>
              <div>
                <p className="text-sm font-semibold text-slate-500 uppercase tracking-wider">KM aprobados</p>
                <p className="text-2xl font-black text-slate-900">{approvedKmThisMonth.toFixed(1)} km</p>
                <p className="text-xs text-slate-400 mt-1 flex items-center gap-1 capitalize">
                  <TrendingUp className="w-3 h-3" /> {monthLabel}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm shadow-slate-200/50 overflow-hidden group">
          <CardContent className="p-6 relative">
            <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-50 -mr-8 -mt-8 rounded-full opacity-50 group-hover:scale-110 transition-transform" />
            <div className="relative flex items-center gap-4">
              <div className="p-3 bg-emerald-50 rounded-2xl"><Receipt className="w-6 h-6 text-emerald-600" /></div>
              <div>
                <p className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Gastos aprobados</p>
                <p className="text-2xl font-black text-slate-900">{approvedAmountThisMonth.toFixed(2)} €</p>
                <p className="text-xs text-slate-400 mt-1 flex items-center gap-1 capitalize">
                  <TrendingUp className="w-3 h-3" /> {monthLabel}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm shadow-slate-200/50 overflow-hidden group">
          <CardContent className="p-6 relative">
            <div className="absolute top-0 right-0 w-24 h-24 bg-amber-50 -mr-8 -mt-8 rounded-full opacity-50 group-hover:scale-110 transition-transform" />
            <div className="relative flex items-center gap-4">
              <div className="p-3 bg-amber-50 rounded-2xl"><Clock className="w-6 h-6 text-amber-500" /></div>
              <div>
                <p className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Pendientes</p>
                <p className="text-2xl font-black text-slate-900">{pendingCount}</p>
                <p className="text-xs text-slate-400 mt-1">Viajes + tickets en espera</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* History */}
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <History className="w-5 h-5 text-slate-400" />
          <h3 className="text-lg font-bold text-slate-900">Historial Completo</h3>
        </div>

        <Tabs defaultValue="trips" className="w-full">
          <TabsList className="bg-white p-1 rounded-2xl border border-slate-100 shadow-sm mb-6">
            <TabsTrigger value="trips" className="rounded-xl px-6 py-2 data-[state=active]:bg-slate-900 data-[state=active]:text-white transition-all">
              Kilometraje ({trips.length})
            </TabsTrigger>
            <TabsTrigger value="tickets" className="rounded-xl px-6 py-2 data-[state=active]:bg-slate-900 data-[state=active]:text-white transition-all">
              Tickets ({tickets.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="trips">
            <Card className="border-none shadow-sm shadow-slate-200/50 overflow-hidden">
              <div className="overflow-x-auto">
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
                      <TableRow><TableCell colSpan={5} className="text-center py-12 text-slate-400">No hay viajes registrados</TableCell></TableRow>
                    ) : trips.map(trip => (
                      <TableRow key={trip.id} className="hover:bg-slate-50/50 transition-colors">
                        <TableCell className="data-grid-cell">{format(trip.date.toDate(), 'dd MMM yyyy', { locale: es })}</TableCell>
                        <TableCell className="data-grid-cell font-mono font-bold text-slate-900">{trip.km} km</TableCell>
                        <TableCell className="data-grid-cell">
                          <div className="flex gap-1">
                            {[trip.startPhotoUrl, trip.endPhotoUrl, trip.photoUrl].filter(Boolean).map((url, i) => (
                              <Dialog key={i}>
                                <DialogTrigger>
                                  <div className="w-8 h-8 rounded-lg overflow-hidden border border-slate-200 cursor-pointer hover:opacity-80 transition-opacity">
                                    <img src={url!} alt="Odómetro" className="w-full h-full object-cover" />
                                  </div>
                                </DialogTrigger>
                                <DialogContent className="sm:max-w-[600px]">
                                  <img src={url!} alt="Odómetro" className="w-full h-auto rounded-xl" />
                                </DialogContent>
                              </Dialog>
                            ))}
                            {!trip.startPhotoUrl && !trip.endPhotoUrl && !trip.photoUrl && (
                              <span className="text-slate-300"><ImageOff className="w-4 h-4" /></span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="data-grid-cell max-w-[180px] truncate text-slate-500">{trip.description || '—'}</TableCell>
                        <TableCell className="data-grid-cell">{getStatusBadge(trip.status)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="tickets">
            <Card className="border-none shadow-sm shadow-slate-200/50 overflow-hidden">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-slate-50/50">
                    <TableRow>
                      <TableHead className="data-grid-header">Fecha</TableHead>
                      <TableHead className="data-grid-header">Categoría</TableHead>
                      <TableHead className="data-grid-header">Importe</TableHead>
                      <TableHead className="data-grid-header">Foto</TableHead>
                      <TableHead className="data-grid-header">Descripción</TableHead>
                      <TableHead className="data-grid-header">Estado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tickets.length === 0 ? (
                      <TableRow><TableCell colSpan={6} className="text-center py-12 text-slate-400">No hay tickets registrados</TableCell></TableRow>
                    ) : tickets.map(ticket => {
                      const cat = TICKET_CATEGORIES.find(c => c.value === ticket.category);
                      return (
                        <TableRow key={ticket.id} className="hover:bg-slate-50/50 transition-colors">
                          <TableCell className="data-grid-cell">{format(ticket.date.toDate(), 'dd MMM yyyy', { locale: es })}</TableCell>
                          <TableCell className="data-grid-cell">
                            <span className="text-sm">{cat ? `${cat.emoji} ${cat.label}` : '📋 Otros'}</span>
                          </TableCell>
                          <TableCell className="data-grid-cell font-mono font-bold text-slate-900">{ticket.amount.toFixed(2)} €</TableCell>
                          <TableCell className="data-grid-cell">
                            {ticket.photoUrl ? (
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
                            ) : <span className="text-slate-300"><ImageOff className="w-4 h-4" /></span>}
                          </TableCell>
                          <TableCell className="data-grid-cell max-w-[160px] truncate text-slate-500">{ticket.description || '—'}</TableCell>
                          <TableCell className="data-grid-cell">{getStatusBadge(ticket.status)}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
