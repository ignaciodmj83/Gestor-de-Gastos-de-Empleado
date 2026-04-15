import React, { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot, orderBy, doc, getDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '@/src/lib/firebase';
import { useAuth } from './AuthProvider';
import { Trip, Ticket, TICKET_CATEGORIES, OrgSettings, DEFAULT_SETTINGS } from '@/src/types';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { TripForm } from './TripForm';
import { TicketForm } from './TicketForm';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  Car, Receipt, Clock, CheckCircle2, XCircle, TrendingUp,
  History, ImageOff, Building2, MapPin, Hash, Euro, FileText
} from 'lucide-react';

// ── Ticket detail modal ───────────────────────────────────────────────────────
function TicketDetail({ ticket }: { ticket: Ticket }) {
  const cat = TICKET_CATEGORIES.find(c => c.value === ticket.category);
  return (
    <Dialog>
      <DialogTrigger className="text-left w-full hover:text-primary transition-colors truncate max-w-[140px] text-xs text-slate-700 bg-transparent border-none p-0 cursor-pointer">
        {ticket.vendorName || ticket.concept || ticket.description || '—'}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle className="font-bold">Detalle del ticket</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-1">
          {ticket.photoUrl && (
            <img src={ticket.photoUrl} alt="Ticket" className="w-full h-40 object-cover rounded-xl border border-slate-100" />
          )}
          <div className="space-y-3 p-4 bg-slate-50 rounded-2xl border border-slate-100 text-sm">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Building2 className="w-3 h-3" /> Emisor
            </p>
            {ticket.vendorName    && <Row icon={<Building2 className="w-3.5 h-3.5 text-slate-400" />} label="Establecimiento" value={ticket.vendorName} />}
            {ticket.vendorCIF     && <Row icon={<Hash className="w-3.5 h-3.5 text-slate-400" />}     label="CIF/NIF"         value={ticket.vendorCIF} mono />}
            {ticket.vendorAddress && <Row icon={<MapPin className="w-3.5 h-3.5 text-slate-400" />}   label="Dirección"       value={ticket.vendorAddress} />}
            {ticket.invoiceNumber && <Row icon={<FileText className="w-3.5 h-3.5 text-slate-400" />} label="Nº Factura"      value={ticket.invoiceNumber} mono />}
            {ticket.concept       && <Row icon={<FileText className="w-3.5 h-3.5 text-slate-400" />} label="Concepto"        value={ticket.concept} />}
            {cat                  && <Row icon={<span>{cat.emoji}</span>}                              label="Categoría"       value={cat.label} />}
          </div>
          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5 mb-3">
              <Euro className="w-3 h-3" /> Importes
            </p>
            <div className="space-y-1.5 text-sm">
              {ticket.baseAmount != null && (
                <div className="flex justify-between"><span className="text-slate-500">Base imponible</span><span className="font-mono">{ticket.baseAmount.toFixed(2)} €</span></div>
              )}
              {ticket.vatPercent != null && (
                <div className="flex justify-between"><span className="text-slate-500">IVA ({ticket.vatPercent}%)</span><span className="font-mono">{(ticket.vatAmount ?? 0).toFixed(2)} €</span></div>
              )}
              <div className="flex justify-between pt-2 border-t border-slate-200 font-bold">
                <span>Total</span><span className="font-mono text-base">{ticket.amount.toFixed(2)} €</span>
              </div>
            </div>
          </div>
          <p className="text-xs text-slate-400 text-right">{format(ticket.date.toDate(), 'dd MMMM yyyy', { locale: es })}</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Row({ icon, label, value, mono }: { icon: React.ReactNode; label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start gap-2">
      <span className="shrink-0 mt-0.5">{icon}</span>
      <div className="min-w-0">
        <p className="text-[10px] text-slate-400 uppercase tracking-wider">{label}</p>
        <p className={`text-slate-700 font-medium break-words text-sm ${mono ? 'font-mono' : ''}`}>{value}</p>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export function UserDashboard() {
  const { profile } = useAuth();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [orgSettings, setOrgSettings] = useState<OrgSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    if (!profile) return;

    // Load org settings for km cost display
    getDoc(doc(db, 'settings', profile.organizationId)).then(snap => {
      if (snap.exists()) setOrgSettings({ ...DEFAULT_SETTINGS, ...snap.data() as OrgSettings });
    }).catch(() => {});

    const unsubTrips = onSnapshot(
      query(collection(db, 'trips'), where('userId', '==', profile.uid), orderBy('date', 'desc')),
      snap => setTrips(snap.docs.map(d => ({ id: d.id, ...d.data() } as Trip))),
      err => handleFirestoreError(err, OperationType.LIST, 'trips')
    );
    const unsubTickets = onSnapshot(
      query(collection(db, 'tickets'), where('userId', '==', profile.uid), orderBy('date', 'desc')),
      snap => setTickets(snap.docs.map(d => ({ id: d.id, ...d.data() } as Ticket))),
      err => handleFirestoreError(err, OperationType.LIST, 'tickets')
    );
    return () => { unsubTrips(); unsubTickets(); };
  }, [profile]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved': return <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-200 border-none px-2 py-0.5 rounded-full text-xs"><CheckCircle2 className="w-3 h-3 mr-1" />Aprobado</Badge>;
      case 'rejected': return <Badge className="bg-rose-100 text-rose-700 hover:bg-rose-200 border-none px-2 py-0.5 rounded-full text-xs"><XCircle className="w-3 h-3 mr-1" />Rechazado</Badge>;
      default:         return <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-200 border-none px-2 py-0.5 rounded-full text-xs"><Clock className="w-3 h-3 mr-1" />Pendiente</Badge>;
    }
  };

  // Current month stats
  const now = new Date();
  const thisMonth = (items: { date: any }[]) => items.filter(t => {
    const d = t.date.toDate(); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  const monthTrips   = thisMonth(trips) as Trip[];
  const monthTickets = thisMonth(tickets) as Ticket[];

  const approvedKm     = monthTrips.filter(t => t.status === 'approved').reduce((a, t) => a + t.km, 0);
  const approvedAmount = monthTrips.filter(t => t.status === 'approved').reduce((a, t) => a + (t.totalAmount ?? t.km * orgSettings.kmCost), 0);
  const approvedGastos = monthTickets.filter(t => t.status === 'approved').reduce((a, t) => a + t.amount, 0);
  const pendingCount   = trips.filter(t => t.status === 'pending').length + tickets.filter(t => t.status === 'pending').length;
  const monthLabel     = format(now, 'MMMM yyyy', { locale: es });

  return (
    <div className="space-y-8 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
        <div className="space-y-1">
          <h2 className="text-3xl font-extrabold tracking-tight text-slate-900">Mis Registros</h2>
          <p className="text-slate-500">Gestiona tus viajes y tickets de forma eficiente.</p>
        </div>
        <div className="flex gap-3">
          <TripForm />
          <TicketForm />
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'KM aprobados',     value: `${approvedKm.toFixed(1)} km`,       icon: Car,     color: 'text-blue-600',    bg: 'bg-blue-50' },
          { label: 'Importe viajes',   value: `${approvedAmount.toFixed(2)} €`,     icon: Euro,    color: 'text-violet-600',  bg: 'bg-violet-50' },
          { label: 'Gastos aprobados', value: `${approvedGastos.toFixed(2)} €`,     icon: Receipt, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'Pendientes',       value: pendingCount,                          icon: Clock,   color: 'text-amber-500',   bg: 'bg-amber-50' },
        ].map((stat, i) => (
          <Card key={i} className="border-none shadow-sm shadow-slate-200/50 overflow-hidden group">
            <CardContent className="p-5 relative">
              <div className={`absolute top-0 right-0 w-20 h-20 ${stat.bg} -mr-6 -mt-6 rounded-full opacity-50 group-hover:scale-110 transition-transform`} />
              <div className="relative flex items-center gap-3">
                <div className={`p-2.5 ${stat.bg} rounded-2xl`}><stat.icon className={`w-5 h-5 ${stat.color}`} /></div>
                <div>
                  <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{stat.label}</p>
                  <p className="text-xl font-black text-slate-900">{stat.value}</p>
                  <p className="text-[10px] text-slate-400 capitalize flex items-center gap-1 mt-0.5">
                    <TrendingUp className="w-3 h-3" /> {monthLabel}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* History */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <History className="w-5 h-5 text-slate-400" />
          <h3 className="text-lg font-bold text-slate-900">Historial</h3>
        </div>

        <Tabs defaultValue="trips" className="w-full">
          <TabsList className="bg-white p-1 rounded-2xl border border-slate-100 shadow-sm mb-5">
            <TabsTrigger value="trips" className="rounded-xl px-6 py-2 data-[state=active]:bg-slate-900 data-[state=active]:text-white transition-all">
              Viajes ({trips.length})
            </TabsTrigger>
            <TabsTrigger value="tickets" className="rounded-xl px-6 py-2 data-[state=active]:bg-slate-900 data-[state=active]:text-white transition-all">
              Tickets ({tickets.length})
            </TabsTrigger>
          </TabsList>

          {/* Trips table */}
          <TabsContent value="trips">
            <Card className="border-none shadow-sm shadow-slate-200/50 overflow-hidden">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-slate-50/50">
                    <TableRow>
                      <TableHead className="data-grid-header">Fecha</TableHead>
                      <TableHead className="data-grid-header">KM</TableHead>
                      <TableHead className="data-grid-header">Importe</TableHead>
                      <TableHead className="data-grid-header">Fotos</TableHead>
                      <TableHead className="data-grid-header">Descripción</TableHead>
                      <TableHead className="data-grid-header">Estado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {trips.length === 0 ? (
                      <TableRow><TableCell colSpan={6} className="text-center py-12 text-slate-400">No hay viajes registrados</TableCell></TableRow>
                    ) : trips.map(trip => (
                      <TableRow key={trip.id} className="hover:bg-slate-50/50 transition-colors">
                        <TableCell className="data-grid-cell">{format(trip.date.toDate(), 'dd MMM yyyy', { locale: es })}</TableCell>
                        <TableCell className="data-grid-cell font-mono font-bold text-slate-900">{trip.km} km</TableCell>
                        <TableCell className="data-grid-cell font-mono font-medium text-indigo-700">
                          {(trip.totalAmount ?? trip.km * orgSettings.kmCost).toFixed(2)} €
                        </TableCell>
                        <TableCell className="data-grid-cell">
                          <div className="flex gap-1">
                            {[trip.startPhotoUrl, trip.endPhotoUrl, trip.photoUrl].filter(Boolean).map((url, i) => (
                              <Dialog key={i}>
                                <DialogTrigger className="w-8 h-8 rounded-lg overflow-hidden border border-slate-200 hover:opacity-80 p-0 transition-opacity">
                                  <img src={url!} alt="km" className="w-full h-full object-cover" />
                                </DialogTrigger>
                                <DialogContent className="sm:max-w-[600px]"><img src={url!} alt="Odómetro" className="w-full h-auto rounded-xl" /></DialogContent>
                              </Dialog>
                            ))}
                            {!trip.startPhotoUrl && !trip.endPhotoUrl && !trip.photoUrl && <ImageOff className="w-4 h-4 text-slate-200" />}
                          </div>
                        </TableCell>
                        <TableCell className="data-grid-cell text-xs text-slate-500 max-w-[140px] truncate">{trip.description || '—'}</TableCell>
                        <TableCell className="data-grid-cell">{getStatusBadge(trip.status)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Card>
          </TabsContent>

          {/* Tickets table */}
          <TabsContent value="tickets">
            <Card className="border-none shadow-sm shadow-slate-200/50 overflow-hidden">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-slate-50/50">
                    <TableRow>
                      <TableHead className="data-grid-header">Fecha</TableHead>
                      <TableHead className="data-grid-header">Cat.</TableHead>
                      <TableHead className="data-grid-header">Total</TableHead>
                      <TableHead className="data-grid-header">IVA</TableHead>
                      <TableHead className="data-grid-header">Proveedor / Concepto</TableHead>
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
                          <TableCell className="data-grid-cell">{format(ticket.date.toDate(), 'dd MMM yy', { locale: es })}</TableCell>
                          <TableCell className="data-grid-cell text-base">{cat ? cat.emoji : '📋'}</TableCell>
                          <TableCell className="data-grid-cell font-mono font-bold text-slate-900">{ticket.amount.toFixed(2)} €</TableCell>
                          <TableCell className="data-grid-cell font-mono text-xs text-slate-500">
                            {ticket.vatPercent != null ? `${ticket.vatPercent}%` : '—'}
                          </TableCell>
                          <TableCell className="data-grid-cell">
                            <TicketDetail ticket={ticket} />
                          </TableCell>
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
