import React, { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot, orderBy, doc, updateDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '@/src/lib/firebase';
import { useAuth } from './AuthProvider';
import { Trip, Ticket, UserProfile, TICKET_CATEGORIES } from '@/src/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format, startOfMonth, endOfMonth, isWithinInterval } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  Users, Car, Receipt, Check, X, BarChart3, Send, FileText,
  Download, Sparkles, ImageOff, AlertTriangle, CalendarDays, Filter
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { toast } from 'sonner';
import { jsPDF } from "jspdf";

// --- CSV Export helper ---
function exportToCSV(rows: Record<string, any>[], filename: string) {
  if (!rows.length) { toast.warning('No hay datos para exportar.'); return; }
  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(';'),
    ...rows.map(r => headers.map(h => `"${String(r[h] ?? '').replace(/"/g, '""')}"`).join(';'))
  ].join('\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
  toast.success('CSV exportado correctamente');
}

// --- Month selector options ---
function getMonthOptions() {
  const options: { value: string; label: string }[] = [{ value: 'all', label: 'Todos los meses' }];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    options.push({
      value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      label: format(d, 'MMMM yyyy', { locale: es }),
    });
  }
  return options;
}

export function AdminDashboard() {
  const { profile } = useAuth();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [filterUser, setFilterUser] = useState<string>('all');
  const [filterMonth, setFilterMonth] = useState<string>('all');
  const [processing, setProcessing] = useState<string | null>(null);

  // Confirmation dialog state
  const [confirmReject, setConfirmReject] = useState<{ type: 'trips' | 'tickets'; id: string; label: string } | null>(null);

  useEffect(() => {
    if (!profile) return;

    const unsubTrips = onSnapshot(
      query(collection(db, 'trips'), where('organizationId', '==', profile.organizationId), orderBy('date', 'desc')),
      (snap) => setTrips(snap.docs.map(d => ({ id: d.id, ...d.data() } as Trip))),
      (err) => handleFirestoreError(err, OperationType.LIST, 'trips')
    );
    const unsubTickets = onSnapshot(
      query(collection(db, 'tickets'), where('organizationId', '==', profile.organizationId), orderBy('date', 'desc')),
      (snap) => setTickets(snap.docs.map(d => ({ id: d.id, ...d.data() } as Ticket))),
      (err) => handleFirestoreError(err, OperationType.LIST, 'tickets')
    );
    const unsubUsers = onSnapshot(
      query(collection(db, 'users'), where('organizationId', '==', profile.organizationId)),
      (snap) => setUsers(snap.docs.map(d => ({ ...d.data() } as UserProfile))),
      (err) => handleFirestoreError(err, OperationType.LIST, 'users')
    );

    return () => { unsubTrips(); unsubTickets(); unsubUsers(); };
  }, [profile]);

  const updateStatus = async (type: 'trips' | 'tickets', id: string, status: 'approved' | 'rejected') => {
    try {
      await updateDoc(doc(db, type, id), { status });
      toast.success(status === 'approved' ? 'Registro aprobado ✓' : 'Registro rechazado');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, type);
    }
  };

  const generatePDF = (ticket: Ticket) => {
    const pdfDoc = new jsPDF();
    const dateStr = format(ticket.date.toDate(), 'dd/MM/yyyy');
    const cat = TICKET_CATEGORIES.find(c => c.value === ticket.category);

    pdfDoc.setFontSize(22);
    pdfDoc.text("Resumen de Factura", 20, 20);
    pdfDoc.setDrawColor(200, 200, 200);
    pdfDoc.line(20, 25, 190, 25);

    pdfDoc.setFontSize(12);
    pdfDoc.text(`Organización: ${profile?.organizationName || profile?.organizationId}`, 20, 38);
    pdfDoc.text(`Usuario: ${ticket.userName || 'N/A'}`, 20, 48);
    pdfDoc.text(`Fecha: ${dateStr}`, 20, 58);
    pdfDoc.text(`Categoría: ${cat ? `${cat.label}` : 'Otros'}`, 20, 68);
    pdfDoc.text(`Importe: ${ticket.amount.toFixed(2)} €`, 20, 78);
    pdfDoc.text(`Descripción: ${ticket.description || 'Sin descripción'}`, 20, 88);
    pdfDoc.text(`Estado: ${ticket.status === 'approved' ? 'Aprobado' : ticket.status === 'rejected' ? 'Rechazado' : 'Pendiente'}`, 20, 98);

    if (ticket.photoUrl) {
      try {
        pdfDoc.addImage(ticket.photoUrl, 'JPEG', 20, 110, 80, 60);
      } catch (_) {
        pdfDoc.text('(Imagen adjunta en el sistema)', 20, 110);
      }
    }

    pdfDoc.save(`factura_${ticket.id.slice(0, 8)}.pdf`);
    toast.success("PDF generado y descargado");
  };

  const processTicket = async (ticket: Ticket) => {
    setProcessing(ticket.id);
    try {
      if (ticket.amount < 50) {
        toast.info(`Enviando ticket de ${ticket.amount.toFixed(2)}€ a recuperación de IVA...`, {
          description: "Proceso automatizado para cuantías inferiores a 50€",
          icon: <Send className="w-4 h-4" />,
        });
        await new Promise(r => setTimeout(r, 1500));
        await updateStatus('tickets', ticket.id, 'approved');
        toast.success("Ticket enviado a recuperación de IVA");
      } else {
        toast.info(`Generando resumen de factura para ${ticket.amount.toFixed(2)}€...`, { icon: <FileText className="w-4 h-4" /> });
        await new Promise(r => setTimeout(r, 800));
        generatePDF(ticket);
        await updateStatus('tickets', ticket.id, 'approved');
      }
    } catch (error) {
      console.error("Error procesando ticket:", error);
      toast.error("Error al procesar el ticket");
    } finally {
      setProcessing(null);
    }
  };

  // --- Filters ---
  const filterByMonth = <T extends { date: any }>(items: T[]): T[] => {
    if (filterMonth === 'all') return items;
    const [year, month] = filterMonth.split('-').map(Number);
    const start = startOfMonth(new Date(year, month - 1));
    const end = endOfMonth(new Date(year, month - 1));
    return items.filter(i => isWithinInterval(i.date.toDate(), { start, end }));
  };

  const filtered = {
    trips:   filterByMonth(filterUser === 'all' ? trips   : trips.filter(t => t.userId === filterUser)),
    tickets: filterByMonth(filterUser === 'all' ? tickets : tickets.filter(t => t.userId === filterUser)),
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved': return <Badge className="bg-emerald-100 text-emerald-700 border-none px-2 py-0.5 rounded-full text-xs">Aprobado</Badge>;
      case 'rejected': return <Badge className="bg-rose-100 text-rose-700 border-none px-2 py-0.5 rounded-full text-xs">Rechazado</Badge>;
      default:         return <Badge className="bg-amber-100 text-amber-700 border-none px-2 py-0.5 rounded-full text-xs">Pendiente</Badge>;
    }
  };

  const chartData = users.map(u => ({
    name: u.name.split(' ')[0],
    km:     trips.filter(t => t.userId === u.uid && t.status === 'approved').reduce((a, t) => a + t.km, 0),
    gastos: tickets.filter(t => t.userId === u.uid && t.status === 'approved').reduce((a, t) => a + t.amount, 0),
  }));

  const monthOptions = getMonthOptions();

  // --- CSV export helpers ---
  const exportTripsCSV = () => {
    exportToCSV(
      filtered.trips.map(t => ({
        Usuario: t.userName || '',
        Fecha: format(t.date.toDate(), 'dd/MM/yyyy'),
        KM: t.km,
        KM_Inicio: t.startKm ?? '',
        KM_Fin: t.endKm ?? '',
        Descripcion: t.description || '',
        Estado: t.status,
      })),
      `viajes_${filterMonth === 'all' ? 'todos' : filterMonth}.csv`
    );
  };

  const exportTicketsCSV = () => {
    exportToCSV(
      filtered.tickets.map(t => {
        const cat = TICKET_CATEGORIES.find(c => c.value === t.category);
        return {
          Usuario: t.userName || '',
          Fecha: format(t.date.toDate(), 'dd/MM/yyyy'),
          Categoria: cat?.label || 'Otros',
          Importe: t.amount.toFixed(2),
          Descripcion: t.description || '',
          Estado: t.status,
        };
      }),
      `tickets_${filterMonth === 'all' ? 'todos' : filterMonth}.csv`
    );
  };

  return (
    <div className="space-y-8 pb-12">
      {/* Header + filters */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="space-y-1">
          <h2 className="text-3xl font-extrabold tracking-tight text-slate-900">Panel de Administración</h2>
          <p className="text-slate-500">
            Supervisa los recursos de <span className="font-semibold text-slate-700">{profile?.organizationName || 'tu organización'}</span>
          </p>
        </div>
        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 bg-white p-1.5 rounded-2xl shadow-sm border border-slate-100">
            <div className="p-2 bg-slate-50 rounded-xl"><Users className="w-4 h-4 text-slate-400" /></div>
            <Select value={filterUser} onValueChange={setFilterUser}>
              <SelectTrigger className="w-[160px] border-none focus:ring-0 shadow-none font-medium text-sm">
                <SelectValue placeholder="Empleado" />
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                <SelectItem value="all">Todos los empleados</SelectItem>
                {users.map(u => <SelectItem key={u.uid} value={u.uid}>{u.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2 bg-white p-1.5 rounded-2xl shadow-sm border border-slate-100">
            <div className="p-2 bg-slate-50 rounded-xl"><CalendarDays className="w-4 h-4 text-slate-400" /></div>
            <Select value={filterMonth} onValueChange={setFilterMonth}>
              <SelectTrigger className="w-[160px] border-none focus:ring-0 shadow-none font-medium text-sm capitalize">
                <SelectValue placeholder="Mes" />
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                {monthOptions.map(o => (
                  <SelectItem key={o.value} value={o.value} className="capitalize">{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[
          { label: 'Empleados activos',  value: users.length, icon: Users,   color: 'text-blue-600',    bg: 'bg-blue-50' },
          { label: 'KM aprobados',       value: `${trips.filter(t => t.status==='approved').reduce((a,t)=>a+t.km,0).toFixed(1)} km`, icon: Car, color: 'text-indigo-600', bg: 'bg-indigo-50' },
          { label: 'Gastos aprobados',   value: `${tickets.filter(t => t.status==='approved').reduce((a,t)=>a+t.amount,0).toFixed(2)} €`, icon: Receipt, color: 'text-emerald-600', bg: 'bg-emerald-50' },
        ].map((stat, i) => (
          <Card key={i} className="border-none shadow-sm shadow-slate-200/50 overflow-hidden group">
            <CardContent className="p-6 relative">
              <div className={`absolute top-0 right-0 w-24 h-24 ${stat.bg} -mr-8 -mt-8 rounded-full opacity-50 group-hover:scale-110 transition-transform`} />
              <div className="relative flex items-center gap-4">
                <div className={`p-3 ${stat.bg} rounded-2xl`}><stat.icon className={`w-6 h-6 ${stat.color}`} /></div>
                <div>
                  <p className="text-sm font-semibold text-slate-500 uppercase tracking-wider">{stat.label}</p>
                  <p className="text-2xl font-black text-slate-900">{stat.value}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Chart + Quick summary */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 border-none shadow-sm shadow-slate-200/50 p-6">
          <CardHeader className="px-0 pt-0 pb-6">
            <CardTitle className="text-lg font-bold flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-primary" /> Rendimiento de Equipo
            </CardTitle>
          </CardHeader>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} dy={10} />
                <YAxis yAxisId="left" orientation="left" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} cursor={{ fill: '#f8fafc' }} />
                <Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={{ paddingBottom: '20px' }} />
                <Bar yAxisId="left"  dataKey="km"     fill="#6366f1" name="Kilómetros"  radius={[6,6,0,0]} barSize={24} />
                <Bar yAxisId="right" dataKey="gastos" fill="#10b981" name="Gastos (€)"  radius={[6,6,0,0]} barSize={24} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="border-none shadow-sm shadow-slate-200/50 p-6">
          <CardHeader className="px-0 pt-0 pb-4">
            <CardTitle className="text-lg font-bold">Resumen Rápido</CardTitle>
            <CardDescription>Estado de las solicitudes</CardDescription>
          </CardHeader>
          <div className="space-y-3">
            {[
              { label: 'Viajes pendientes',  count: trips.filter(t=>t.status==='pending').length,   color: 'bg-amber-500' },
              { label: 'Tickets pendientes', count: tickets.filter(t=>t.status==='pending').length, color: 'bg-blue-500' },
              { label: 'Total aprobados',    count: trips.filter(t=>t.status==='approved').length + tickets.filter(t=>t.status==='approved').length, color: 'bg-emerald-500' },
              { label: 'Total rechazados',   count: trips.filter(t=>t.status==='rejected').length + tickets.filter(t=>t.status==='rejected').length, color: 'bg-rose-400' },
            ].map((item, i) => (
              <div key={i} className="flex items-center justify-between p-3 bg-slate-50 rounded-2xl">
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${item.color}`} />
                  <span className="text-sm font-medium text-slate-600">{item.label}</span>
                </div>
                <span className="text-lg font-bold text-slate-900">{item.count}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Tables */}
      <Tabs defaultValue="trips" className="w-full">
        <TabsList className="bg-white p-1 rounded-2xl border border-slate-100 shadow-sm mb-6">
          <TabsTrigger value="trips"   className="rounded-xl px-6 py-2 data-[state=active]:bg-slate-900 data-[state=active]:text-white transition-all">
            Viajes ({filtered.trips.length})
          </TabsTrigger>
          <TabsTrigger value="tickets" className="rounded-xl px-6 py-2 data-[state=active]:bg-slate-900 data-[state=active]:text-white transition-all">
            Tickets ({filtered.tickets.length})
          </TabsTrigger>
        </TabsList>

        {/* TRIPS TABLE */}
        <TabsContent value="trips">
          <Card className="border-none shadow-sm shadow-slate-200/50 overflow-hidden">
            <div className="flex justify-end p-3 border-b border-slate-50">
              <Button size="sm" variant="outline" className="gap-2 text-xs rounded-xl" onClick={exportTripsCSV}>
                <Download className="w-3.5 h-3.5" /> Exportar CSV
              </Button>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-slate-50/50">
                  <TableRow>
                    <TableHead className="data-grid-header">Usuario</TableHead>
                    <TableHead className="data-grid-header">Fecha</TableHead>
                    <TableHead className="data-grid-header">Distancia</TableHead>
                    <TableHead className="data-grid-header">Evidencia</TableHead>
                    <TableHead className="data-grid-header">Estado</TableHead>
                    <TableHead className="data-grid-header text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.trips.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-12 text-slate-400">
                      <Filter className="w-5 h-5 mx-auto mb-2 opacity-40" />
                      No hay registros de viajes
                    </TableCell></TableRow>
                  ) : filtered.trips.map(trip => (
                    <TableRow key={trip.id} className="hover:bg-slate-50/50 transition-colors">
                      <TableCell className="data-grid-cell font-bold text-slate-900">{trip.userName || 'Usuario'}</TableCell>
                      <TableCell className="data-grid-cell">{format(trip.date.toDate(), 'dd MMM yyyy', { locale: es })}</TableCell>
                      <TableCell className="data-grid-cell font-mono font-medium">{trip.km} km</TableCell>
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
                      <TableCell className="data-grid-cell">{getStatusBadge(trip.status)}</TableCell>
                      <TableCell className="data-grid-cell text-right">
                        {/* FIXED: always visible, not only on hover (mobile-friendly) */}
                        {trip.status === 'pending' && (
                          <div className="flex justify-end gap-2">
                            <Button size="sm" variant="outline" className="h-8 w-8 p-0 rounded-xl text-emerald-600 hover:bg-emerald-50 border-emerald-100"
                              onClick={() => updateStatus('trips', trip.id, 'approved')} title="Aprobar">
                              <Check className="h-4 w-4" />
                            </Button>
                            <Button size="sm" variant="outline" className="h-8 w-8 p-0 rounded-xl text-rose-600 hover:bg-rose-50 border-rose-100"
                              onClick={() => setConfirmReject({ type: 'trips', id: trip.id, label: `${trip.km} km de ${trip.userName}` })} title="Rechazar">
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>

        {/* TICKETS TABLE */}
        <TabsContent value="tickets">
          <Card className="border-none shadow-sm shadow-slate-200/50 overflow-hidden">
            <div className="flex justify-end p-3 border-b border-slate-50">
              <Button size="sm" variant="outline" className="gap-2 text-xs rounded-xl" onClick={exportTicketsCSV}>
                <Download className="w-3.5 h-3.5" /> Exportar CSV
              </Button>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-slate-50/50">
                  <TableRow>
                    <TableHead className="data-grid-header">Usuario</TableHead>
                    <TableHead className="data-grid-header">Fecha</TableHead>
                    <TableHead className="data-grid-header">Categoría</TableHead>
                    <TableHead className="data-grid-header">Importe</TableHead>
                    <TableHead className="data-grid-header">Foto</TableHead>
                    <TableHead className="data-grid-header">Estado</TableHead>
                    <TableHead className="data-grid-header text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.tickets.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-12 text-slate-400">
                      <Filter className="w-5 h-5 mx-auto mb-2 opacity-40" />
                      No hay registros de tickets
                    </TableCell></TableRow>
                  ) : filtered.tickets.map(ticket => {
                    const cat = TICKET_CATEGORIES.find(c => c.value === ticket.category);
                    return (
                      <TableRow key={ticket.id} className="hover:bg-slate-50/50 transition-colors">
                        <TableCell className="data-grid-cell font-bold text-slate-900">{ticket.userName || 'Usuario'}</TableCell>
                        <TableCell className="data-grid-cell">{format(ticket.date.toDate(), 'dd MMM yyyy', { locale: es })}</TableCell>
                        <TableCell className="data-grid-cell">
                          <span className="text-sm">{cat ? `${cat.emoji} ${cat.label}` : '📋 Otros'}</span>
                        </TableCell>
                        <TableCell className="data-grid-cell font-mono font-medium">{ticket.amount.toFixed(2)} €</TableCell>
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
                        <TableCell className="data-grid-cell">{getStatusBadge(ticket.status)}</TableCell>
                        <TableCell className="data-grid-cell text-right">
                          {ticket.status === 'pending' ? (
                            <div className="flex justify-end gap-2">
                              <Button size="sm" className="gap-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-xs px-3"
                                onClick={() => processTicket(ticket)} disabled={processing === ticket.id}>
                                {processing === ticket.id
                                  ? <><Sparkles className="w-3.5 h-3.5 animate-spin" /> Procesando...</>
                                  : <><Sparkles className="w-3.5 h-3.5" /> Procesar</>}
                              </Button>
                              <Button size="sm" variant="outline" className="h-8 w-8 p-0 rounded-xl text-rose-600 hover:bg-rose-50 border-rose-100"
                                onClick={() => setConfirmReject({ type: 'tickets', id: ticket.id, label: `${ticket.amount.toFixed(2)}€ de ${ticket.userName}` })} title="Rechazar">
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          ) : (
                            <Button size="sm" variant="ghost" className="h-8 w-8 p-0 rounded-xl text-slate-400 hover:text-primary"
                              onClick={() => generatePDF(ticket)} title="Descargar PDF">
                              <Download className="h-4 w-4" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Confirm Reject Dialog */}
      <Dialog open={!!confirmReject} onOpenChange={(v) => { if (!v) setConfirmReject(null); }}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-600">
              <AlertTriangle className="w-5 h-5" /> Confirmar rechazo
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-600 py-2">
            ¿Estás seguro de que deseas rechazar el registro <span className="font-bold">{confirmReject?.label}</span>? Esta acción se puede deshacer manualmente.
          </p>
          <DialogFooter className="gap-2">
            <Button variant="outline" className="rounded-xl" onClick={() => setConfirmReject(null)}>Cancelar</Button>
            <Button variant="destructive" className="rounded-xl" onClick={() => {
              if (confirmReject) { updateStatus(confirmReject.type, confirmReject.id, 'rejected'); setConfirmReject(null); }
            }}>
              Sí, rechazar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
