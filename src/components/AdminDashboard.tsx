import React, { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot, orderBy, doc, updateDoc, getDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '@/src/lib/firebase';
import { useAuth } from './AuthProvider';
import { Trip, Ticket, UserProfile, TICKET_CATEGORIES, OrgSettings, DEFAULT_SETTINGS } from '@/src/types';
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
  Download, Sparkles, ImageOff, AlertTriangle, CalendarDays,
  Filter, Building2, MapPin, Hash, Euro, Eye
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { toast } from 'sonner';
import { jsPDF } from 'jspdf';

// ── CSV export ────────────────────────────────────────────────────────────────
function exportToCSV(rows: Record<string, any>[], filename: string) {
  if (!rows.length) { toast.warning('No hay datos para exportar.'); return; }
  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(';'),
    ...rows.map(r => headers.map(h => `"${String(r[h] ?? '').replace(/"/g, '""')}"`).join(';'))
  ].join('\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
  toast.success('CSV exportado');
}

// ── Month options ─────────────────────────────────────────────────────────────
function getMonthOptions() {
  const opts: { value: string; label: string }[] = [{ value: 'all', label: 'Todos los meses' }];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    opts.push({ value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, label: format(d, 'MMMM yyyy', { locale: es }) });
  }
  return opts;
}

// ── Ticket detail modal ───────────────────────────────────────────────────────
function TicketDetailModal({ ticket }: { ticket: Ticket }) {
  const cat = TICKET_CATEGORIES.find(c => c.value === ticket.category);
  return (
    <Dialog>
      <DialogTrigger>
        <Button size="sm" variant="ghost" className="h-8 w-8 p-0 rounded-xl text-slate-400 hover:text-primary" title="Ver detalle">
          <Eye className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="font-bold">Detalle fiscal del ticket</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-1">
          {/* Photo */}
          {ticket.photoUrl && (
            <img src={ticket.photoUrl} alt="Ticket" className="w-full h-48 object-cover rounded-xl border border-slate-100" />
          )}
          {/* Vendor info */}
          <div className="space-y-2 p-4 bg-slate-50 rounded-2xl border border-slate-100">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Building2 className="w-3 h-3" /> Datos del Emisor
            </p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <Field label="Establecimiento" value={ticket.vendorName} />
              <Field label="CIF/NIF" value={ticket.vendorCIF} mono />
              <Field label="Nº Factura"  value={ticket.invoiceNumber} mono />
              <Field label="Categoría" value={cat ? `${cat.emoji} ${cat.label}` : null} />
              <div className="col-span-2"><Field label="Dirección" value={ticket.vendorAddress} /></div>
              <div className="col-span-2"><Field label="Concepto" value={ticket.concept || ticket.description} /></div>
            </div>
          </div>
          {/* Amounts */}
          <div className="space-y-2 p-4 bg-slate-50 rounded-2xl border border-slate-100">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Euro className="w-3 h-3" /> Importes
            </p>
            <div className="grid grid-cols-3 gap-x-4 gap-y-2 text-sm">
              <Field label="Base imponible" value={ticket.baseAmount != null ? `${ticket.baseAmount.toFixed(2)} €` : null} mono />
              <Field label="IVA %" value={ticket.vatPercent != null ? `${ticket.vatPercent}%` : null} mono />
              <Field label="Cuota IVA" value={ticket.vatAmount != null ? `${ticket.vatAmount.toFixed(2)} €` : null} mono />
            </div>
            <div className="flex justify-between items-center pt-2 border-t border-slate-200">
              <span className="text-sm font-semibold text-slate-600">Total</span>
              <span className="text-xl font-black text-slate-900">{ticket.amount.toFixed(2)} €</span>
            </div>
          </div>
          {/* Meta */}
          <div className="flex justify-between text-xs text-slate-400 px-1">
            <span>Empleado: <span className="font-medium text-slate-600">{ticket.userName}</span></span>
            <span>{format(ticket.date.toDate(), 'dd MMM yyyy', { locale: es })}</span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, value, mono }: { label: string; value?: string | null; mono?: boolean }) {
  if (!value) return (
    <div>
      <p className="text-[10px] text-slate-400 uppercase tracking-wider">{label}</p>
      <p className="text-slate-300 text-xs italic">—</p>
    </div>
  );
  return (
    <div>
      <p className="text-[10px] text-slate-400 uppercase tracking-wider">{label}</p>
      <p className={`text-slate-700 font-medium break-words ${mono ? 'font-mono' : ''}`}>{value}</p>
    </div>
  );
}

// ── Trip detail modal ─────────────────────────────────────────────────────────
function TripDetailModal({ trip }: { trip: Trip }) {
  return (
    <Dialog>
      <DialogTrigger>
        <Button size="sm" variant="ghost" className="h-8 w-8 p-0 rounded-xl text-slate-400 hover:text-primary" title="Ver detalle">
          <Eye className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle className="font-bold">Detalle del viaje</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-1">
          {/* Odometer photos */}
          {(trip.startPhotoUrl || trip.endPhotoUrl) && (
            <div className="grid grid-cols-2 gap-2">
              {trip.startPhotoUrl && (
                <div className="space-y-1">
                  <p className="text-[10px] font-bold uppercase text-slate-400 text-center">Inicio</p>
                  <img src={trip.startPhotoUrl} alt="Odómetro inicio" className="w-full rounded-xl border border-slate-100 object-cover h-32" />
                </div>
              )}
              {trip.endPhotoUrl && (
                <div className="space-y-1">
                  <p className="text-[10px] font-bold uppercase text-slate-400 text-center">Fin</p>
                  <img src={trip.endPhotoUrl} alt="Odómetro fin" className="w-full rounded-xl border border-slate-100 object-cover h-32" />
                </div>
              )}
            </div>
          )}
          <div className="space-y-2 p-4 bg-slate-50 rounded-2xl border border-slate-100">
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <Field label="Empleado" value={trip.userName} />
              <Field label="Fecha" value={format(trip.date.toDate(), 'dd MMM yyyy', { locale: es })} />
              <Field label="KM inicio" value={trip.startKm != null ? `${trip.startKm.toLocaleString('es-ES')} km` : null} mono />
              <Field label="KM fin"    value={trip.endKm != null ? `${trip.endKm.toLocaleString('es-ES')} km` : null} mono />
              <Field label="KM totales" value={`${trip.km} km`} mono />
              <Field label="Coste/km"  value={trip.kmCost != null ? `${trip.kmCost} €/km` : null} mono />
            </div>
            <div className="flex justify-between items-center pt-2 border-t border-slate-200">
              <span className="text-sm font-semibold text-slate-600">Importe total</span>
              <span className="text-xl font-black text-slate-900">
                {trip.totalAmount != null ? `${trip.totalAmount.toFixed(2)} €` : `${(trip.km * (trip.kmCost ?? 0.26)).toFixed(2)} €`}
              </span>
            </div>
          </div>
          {trip.description && (
            <div className="px-1">
              <p className="text-[10px] text-slate-400 uppercase tracking-wider">Descripción</p>
              <p className="text-sm text-slate-700 mt-0.5">{trip.description}</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export function AdminDashboard() {
  const { profile } = useAuth();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [orgSettings, setOrgSettings] = useState<OrgSettings>(DEFAULT_SETTINGS);
  const [filterUser, setFilterUser] = useState('all');
  const [filterMonth, setFilterMonth] = useState('all');
  const [processing, setProcessing] = useState<string | null>(null);
  const [confirmReject, setConfirmReject] = useState<{ type: 'trips' | 'tickets'; id: string; label: string } | null>(null);

  useEffect(() => {
    if (!profile) return;
    const orgId = profile.organizationId;

    // Load org settings
    getDoc(doc(db, 'settings', orgId)).then(snap => {
      if (snap.exists()) setOrgSettings({ ...DEFAULT_SETTINGS, ...snap.data() as OrgSettings });
    }).catch(() => {});

    const unsubTrips = onSnapshot(
      query(collection(db, 'trips'), where('organizationId', '==', orgId), orderBy('date', 'desc')),
      snap => setTrips(snap.docs.map(d => ({ id: d.id, ...d.data() } as Trip))),
      err => handleFirestoreError(err, OperationType.LIST, 'trips')
    );
    const unsubTickets = onSnapshot(
      query(collection(db, 'tickets'), where('organizationId', '==', orgId), orderBy('date', 'desc')),
      snap => setTickets(snap.docs.map(d => ({ id: d.id, ...d.data() } as Ticket))),
      err => handleFirestoreError(err, OperationType.LIST, 'tickets')
    );
    const unsubUsers = onSnapshot(
      query(collection(db, 'users'), where('organizationId', '==', orgId)),
      snap => setUsers(snap.docs.map(d => ({ ...d.data() } as UserProfile))),
      err => handleFirestoreError(err, OperationType.LIST, 'users')
    );
    return () => { unsubTrips(); unsubTickets(); unsubUsers(); };
  }, [profile]);

  const updateStatus = async (type: 'trips' | 'tickets', id: string, status: 'approved' | 'rejected') => {
    try {
      await updateDoc(doc(db, type, id), { status });
      toast.success(status === 'approved' ? 'Aprobado ✓' : 'Rechazado');
    } catch (err) { handleFirestoreError(err, OperationType.UPDATE, type); }
  };

  // ── PDF with company fiscal data ──────────────────────────────────────────
  const generatePDF = (ticket: Ticket) => {
    const pdf = new jsPDF();
    const dateStr = format(ticket.date.toDate(), 'dd/MM/yyyy');
    const cat = TICKET_CATEGORIES.find(c => c.value === ticket.category);

    // Header
    pdf.setFontSize(20); pdf.setFont('helvetica', 'bold');
    pdf.text('RESUMEN DE GASTO', 20, 22);
    pdf.setDrawColor(220, 220, 220); pdf.line(20, 27, 190, 27);

    // Issuing company (from settings)
    pdf.setFontSize(9); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(120, 120, 120);
    pdf.text('EMPRESA EMISORA', 20, 35);
    pdf.setTextColor(30, 30, 30); pdf.setFontSize(11); pdf.setFont('helvetica', 'bold');
    pdf.text(orgSettings.companyName || profile?.organizationName || 'N/A', 20, 42);
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9); pdf.setTextColor(80, 80, 80);
    if (orgSettings.companyCIF)     pdf.text(`CIF: ${orgSettings.companyCIF}`, 20, 48);
    if (orgSettings.companyAddress) pdf.text(orgSettings.companyAddress, 20, 54);
    if (orgSettings.companyEmail)   pdf.text(orgSettings.companyEmail, 20, 60);

    pdf.line(20, 66, 190, 66);

    // Ticket / vendor data
    pdf.setFontSize(9); pdf.setTextColor(120, 120, 120);
    pdf.text('DATOS DEL PROVEEDOR', 20, 74);
    pdf.setTextColor(30, 30, 30); pdf.setFontSize(10); pdf.setFont('helvetica', 'bold');
    pdf.text(ticket.vendorName || 'N/A', 20, 81);
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9); pdf.setTextColor(80, 80, 80);
    let y = 87;
    if (ticket.vendorCIF)     { pdf.text(`CIF/NIF: ${ticket.vendorCIF}`, 20, y); y += 6; }
    if (ticket.vendorAddress) { pdf.text(`Dirección: ${ticket.vendorAddress}`, 20, y); y += 6; }
    if (ticket.invoiceNumber) { pdf.text(`Nº Factura: ${ticket.invoiceNumber}`, 20, y); y += 6; }

    pdf.line(20, y + 2, 190, y + 2); y += 10;

    // Employee + concept
    pdf.setFontSize(9); pdf.setTextColor(120, 120, 120); pdf.text('EMPLEADO', 20, y); pdf.text('FECHA', 110, y); y += 7;
    pdf.setTextColor(30, 30, 30); pdf.setFontSize(10); pdf.setFont('helvetica', 'bold');
    pdf.text(ticket.userName || 'N/A', 20, y); pdf.text(dateStr, 110, y); y += 8;
    if (ticket.concept || ticket.description) {
      pdf.setFontSize(9); pdf.setTextColor(120, 120, 120); pdf.text('CONCEPTO', 20, y); y += 6;
      pdf.setTextColor(60, 60, 60); pdf.setFont('helvetica', 'normal');
      pdf.text(ticket.concept || ticket.description || '', 20, y); y += 8;
    }
    if (cat) {
      pdf.setFontSize(9); pdf.setTextColor(120, 120, 120); pdf.text('CATEGORÍA', 20, y); y += 6;
      pdf.setTextColor(60, 60, 60); pdf.setFont('helvetica', 'normal');
      pdf.text(cat.label, 20, y); y += 8;
    }

    pdf.line(20, y, 190, y); y += 8;

    // Amounts table
    pdf.setFontSize(9); pdf.setTextColor(120, 120, 120); pdf.text('DESGLOSE DE IMPORTES', 20, y); y += 8;
    const amountRows: [string, string][] = [];
    if (ticket.baseAmount != null) amountRows.push(['Base imponible', `${ticket.baseAmount.toFixed(2)} €`]);
    if (ticket.vatPercent != null) amountRows.push([`IVA (${ticket.vatPercent}%)`, `${(ticket.vatAmount ?? 0).toFixed(2)} €`]);
    amountRows.push(['TOTAL', `${ticket.amount.toFixed(2)} €`]);
    amountRows.forEach(([label, value], i) => {
      const isTotal = i === amountRows.length - 1;
      pdf.setFont('helvetica', isTotal ? 'bold' : 'normal');
      pdf.setFontSize(isTotal ? 12 : 10);
      pdf.setTextColor(isTotal ? 0 : 60, isTotal ? 0 : 60, isTotal ? 0 : 60);
      pdf.text(label, 20, y);
      pdf.text(value, 190 - pdf.getTextWidth(value), y);
      y += isTotal ? 10 : 7;
    });

    // Photo
    if (ticket.photoUrl) {
      try { pdf.addImage(ticket.photoUrl, 'JPEG', 20, y + 5, 75, 55); } catch (_) {}
    }

    // Footer
    pdf.setFontSize(8); pdf.setTextColor(160, 160, 160); pdf.setFont('helvetica', 'italic');
    pdf.text(`Generado el ${format(new Date(), 'dd/MM/yyyy HH:mm')} · Km & Tickets Pro`, 20, 285);

    pdf.save(`gasto_${ticket.id.slice(0, 8)}_${dateStr.replace(/\//g, '-')}.pdf`);
    toast.success('PDF generado y descargado');
  };

  // ── Process ticket using org settings threshold ───────────────────────────
  const processTicket = async (ticket: Ticket) => {
    setProcessing(ticket.id);
    const threshold = orgSettings.maxAutoApproveAmount ?? DEFAULT_SETTINGS.maxAutoApproveAmount!;
    try {
      if (ticket.amount < threshold) {
        const dest = orgSettings.defaultSendEmail ? ` → ${orgSettings.defaultSendEmail}` : '';
        toast.info(`Enviando ticket de ${ticket.amount.toFixed(2)} €${dest}…`, {
          description: `Proceso automático para importes < ${threshold} €`,
          icon: <Send className="w-4 h-4" />,
        });
        await new Promise(r => setTimeout(r, 1200));
        await updateStatus('tickets', ticket.id, 'approved');
        toast.success('Ticket enviado a recuperación de IVA');
      } else {
        toast.info(`Generando resumen para ${ticket.amount.toFixed(2)} €…`, { icon: <FileText className="w-4 h-4" /> });
        await new Promise(r => setTimeout(r, 600));
        generatePDF(ticket);
        await updateStatus('tickets', ticket.id, 'approved');
      }
    } catch (err) {
      toast.error('Error al procesar el ticket');
    } finally {
      setProcessing(null);
    }
  };

  // ── Filters ───────────────────────────────────────────────────────────────
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
    const map: Record<string, React.ReactElement> = {
      approved: <Badge className="bg-emerald-100 text-emerald-700 border-none px-2 py-0.5 rounded-full text-xs">Aprobado</Badge>,
      rejected: <Badge className="bg-rose-100 text-rose-700 border-none px-2 py-0.5 rounded-full text-xs">Rechazado</Badge>,
    };
    return map[status] ?? <Badge className="bg-amber-100 text-amber-700 border-none px-2 py-0.5 rounded-full text-xs">Pendiente</Badge>;
  };

  const chartData = users.map(u => ({
    name: u.name.split(' ')[0],
    km:      trips.filter(t => t.userId === u.uid && t.status === 'approved').reduce((a, t) => a + t.km, 0),
    gastos:  tickets.filter(t => t.userId === u.uid && t.status === 'approved').reduce((a, t) => a + t.amount, 0),
    importe: trips.filter(t => t.userId === u.uid && t.status === 'approved').reduce((a, t) => a + (t.totalAmount ?? t.km * orgSettings.kmCost), 0),
  }));

  const monthOptions = getMonthOptions();
  const totalKmAmount = trips.filter(t => t.status === 'approved').reduce((a, t) => a + (t.totalAmount ?? t.km * orgSettings.kmCost), 0);

  // ── CSV exports ───────────────────────────────────────────────────────────
  const exportTripsCSV = () => exportToCSV(
    filtered.trips.map(t => ({
      Usuario: t.userName || '', Fecha: format(t.date.toDate(), 'dd/MM/yyyy'),
      KM: t.km, KM_Inicio: t.startKm ?? '', KM_Fin: t.endKm ?? '',
      Coste_km: t.kmCost ?? orgSettings.kmCost,
      Importe: (t.totalAmount ?? t.km * orgSettings.kmCost).toFixed(2),
      Descripcion: t.description || '', Estado: t.status,
    })),
    `viajes_${filterMonth === 'all' ? 'todos' : filterMonth}.csv`
  );

  const exportTicketsCSV = () => exportToCSV(
    filtered.tickets.map(t => {
      const cat = TICKET_CATEGORIES.find(c => c.value === t.category);
      return {
        Usuario: t.userName || '', Fecha: format(t.date.toDate(), 'dd/MM/yyyy'),
        Proveedor: t.vendorName || '', CIF: t.vendorCIF || '',
        Direccion: t.vendorAddress || '', Nº_Factura: t.invoiceNumber || '',
        Concepto: t.concept || t.description || '',
        Categoria: cat?.label || 'Otros',
        Base_Imponible: t.baseAmount?.toFixed(2) ?? '',
        IVA_pct: t.vatPercent ?? '', IVA_importe: t.vatAmount?.toFixed(2) ?? '',
        Total: t.amount.toFixed(2), Estado: t.status,
      };
    }),
    `tickets_${filterMonth === 'all' ? 'todos' : filterMonth}.csv`
  );

  return (
    <div className="space-y-8 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="space-y-1">
          <h2 className="text-3xl font-extrabold tracking-tight text-slate-900">Panel de Administración</h2>
          <p className="text-slate-500">
            Supervisa los recursos de <span className="font-semibold text-slate-700">{profile?.organizationName || 'tu organización'}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {/* Filter: user */}
          <div className="flex items-center gap-2 bg-white p-1.5 rounded-2xl shadow-sm border border-slate-100">
            <div className="p-1.5 bg-slate-50 rounded-xl"><Users className="w-4 h-4 text-slate-400" /></div>
            <Select value={filterUser} onValueChange={setFilterUser}>
              <SelectTrigger className="w-[150px] border-none focus:ring-0 shadow-none font-medium text-sm">
                <SelectValue placeholder="Empleado" />
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                <SelectItem value="all">Todos</SelectItem>
                {users.map(u => <SelectItem key={u.uid} value={u.uid}>{u.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {/* Filter: month */}
          <div className="flex items-center gap-2 bg-white p-1.5 rounded-2xl shadow-sm border border-slate-100">
            <div className="p-1.5 bg-slate-50 rounded-xl"><CalendarDays className="w-4 h-4 text-slate-400" /></div>
            <Select value={filterMonth} onValueChange={setFilterMonth}>
              <SelectTrigger className="w-[150px] border-none focus:ring-0 shadow-none font-medium text-sm capitalize">
                <SelectValue placeholder="Mes" />
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                {monthOptions.map(o => <SelectItem key={o.value} value={o.value} className="capitalize">{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Empleados',        value: users.length, icon: Users,   color: 'text-blue-600',    bg: 'bg-blue-50' },
          { label: 'KM aprobados',     value: `${trips.filter(t => t.status==='approved').reduce((a,t)=>a+t.km,0).toFixed(0)} km`, icon: Car, color: 'text-indigo-600', bg: 'bg-indigo-50' },
          { label: 'Importe viajes',   value: `${totalKmAmount.toFixed(2)} €`, icon: Euro,    color: 'text-violet-600',  bg: 'bg-violet-50' },
          { label: 'Gastos aprobados', value: `${tickets.filter(t => t.status==='approved').reduce((a,t)=>a+t.amount,0).toFixed(2)} €`, icon: Receipt, color: 'text-emerald-600', bg: 'bg-emerald-50' },
        ].map((stat, i) => (
          <Card key={i} className="border-none shadow-sm shadow-slate-200/50 overflow-hidden group">
            <CardContent className="p-5 relative">
              <div className={`absolute top-0 right-0 w-20 h-20 ${stat.bg} -mr-6 -mt-6 rounded-full opacity-50 group-hover:scale-110 transition-transform`} />
              <div className="relative flex items-center gap-3">
                <div className={`p-2.5 ${stat.bg} rounded-2xl`}><stat.icon className={`w-5 h-5 ${stat.color}`} /></div>
                <div>
                  <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{stat.label}</p>
                  <p className="text-xl font-black text-slate-900">{stat.value}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Chart + Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 border-none shadow-sm shadow-slate-200/50 p-6">
          <CardHeader className="px-0 pt-0 pb-4">
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-primary" /> Rendimiento por Empleado
            </CardTitle>
          </CardHeader>
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} dy={8} />
                <YAxis yAxisId="l" orientation="left"  axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11 }} />
                <YAxis yAxisId="r" orientation="right" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11 }} />
                <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} cursor={{ fill: '#f8fafc' }} />
                <Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={{ paddingBottom: '16px' }} />
                <Bar yAxisId="l" dataKey="km"      fill="#6366f1" name="Kilómetros"  radius={[6,6,0,0]} barSize={20} />
                <Bar yAxisId="r" dataKey="gastos"  fill="#10b981" name="Gastos (€)"  radius={[6,6,0,0]} barSize={20} />
                <Bar yAxisId="r" dataKey="importe" fill="#8b5cf6" name="Viajes (€)"  radius={[6,6,0,0]} barSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="border-none shadow-sm shadow-slate-200/50 p-6">
          <CardHeader className="px-0 pt-0 pb-3">
            <CardTitle className="text-base font-bold">Estado actual</CardTitle>
            <CardDescription>Solicitudes pendientes de revisión</CardDescription>
          </CardHeader>
          <div className="space-y-2.5">
            {[
              { label: 'Viajes pendientes',  count: trips.filter(t=>t.status==='pending').length,   color: 'bg-amber-400' },
              { label: 'Tickets pendientes', count: tickets.filter(t=>t.status==='pending').length, color: 'bg-blue-400' },
              { label: 'Total aprobados',    count: trips.filter(t=>t.status==='approved').length + tickets.filter(t=>t.status==='approved').length, color: 'bg-emerald-400' },
              { label: 'Total rechazados',   count: trips.filter(t=>t.status==='rejected').length + tickets.filter(t=>t.status==='rejected').length, color: 'bg-rose-300' },
            ].map((item, i) => (
              <div key={i} className="flex items-center justify-between px-4 py-3 bg-slate-50 rounded-2xl">
                <div className="flex items-center gap-2.5">
                  <div className={`w-2 h-2 rounded-full ${item.color}`} />
                  <span className="text-sm font-medium text-slate-600">{item.label}</span>
                </div>
                <span className="text-lg font-bold text-slate-900">{item.count}</span>
              </div>
            ))}
          </div>
          {/* Km cost info */}
          <div className="mt-4 p-3 bg-indigo-50 rounded-2xl border border-indigo-100">
            <p className="text-[10px] text-indigo-500 font-semibold uppercase tracking-wider">Tarifa activa</p>
            <p className="text-lg font-black text-indigo-700 mt-0.5">{orgSettings.kmCost} €/km</p>
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

        {/* ── TRIPS ── */}
        <TabsContent value="trips">
          <Card className="border-none shadow-sm shadow-slate-200/50 overflow-hidden">
            <div className="flex justify-end p-3 border-b border-slate-50">
              <Button size="sm" variant="outline" className="gap-2 text-xs rounded-xl" onClick={exportTripsCSV}>
                <Download className="w-3.5 h-3.5" /> CSV
              </Button>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-slate-50/50">
                  <TableRow>
                    <TableHead className="data-grid-header">Empleado</TableHead>
                    <TableHead className="data-grid-header">Fecha</TableHead>
                    <TableHead className="data-grid-header">KM</TableHead>
                    <TableHead className="data-grid-header">Importe</TableHead>
                    <TableHead className="data-grid-header">Fotos</TableHead>
                    <TableHead className="data-grid-header">Estado</TableHead>
                    <TableHead className="data-grid-header text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.trips.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-12 text-slate-300">
                      <Filter className="w-5 h-5 mx-auto mb-2" /> Sin registros
                    </TableCell></TableRow>
                  ) : filtered.trips.map(trip => (
                    <TableRow key={trip.id} className="hover:bg-slate-50/50 transition-colors">
                      <TableCell className="data-grid-cell font-bold text-slate-900">{trip.userName || 'Usuario'}</TableCell>
                      <TableCell className="data-grid-cell">{format(trip.date.toDate(), 'dd MMM yyyy', { locale: es })}</TableCell>
                      <TableCell className="data-grid-cell font-mono font-medium">{trip.km} km</TableCell>
                      <TableCell className="data-grid-cell font-mono font-bold text-indigo-700">
                        {(trip.totalAmount ?? trip.km * orgSettings.kmCost).toFixed(2)} €
                      </TableCell>
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
                          {!trip.startPhotoUrl && !trip.endPhotoUrl && !trip.photoUrl && <ImageOff className="w-4 h-4 text-slate-200" />}
                        </div>
                      </TableCell>
                      <TableCell className="data-grid-cell">{getStatusBadge(trip.status)}</TableCell>
                      <TableCell className="data-grid-cell">
                        <div className="flex justify-end gap-1">
                          <TripDetailModal trip={trip} />
                          {trip.status === 'pending' && (
                            <>
                              <Button size="sm" variant="outline" className="h-8 w-8 p-0 rounded-xl text-emerald-600 hover:bg-emerald-50 border-emerald-100"
                                onClick={() => updateStatus('trips', trip.id, 'approved')}><Check className="h-4 w-4" /></Button>
                              <Button size="sm" variant="outline" className="h-8 w-8 p-0 rounded-xl text-rose-600 hover:bg-rose-50 border-rose-100"
                                onClick={() => setConfirmReject({ type: 'trips', id: trip.id, label: `${trip.km} km de ${trip.userName}` })}><X className="h-4 w-4" /></Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>

        {/* ── TICKETS ── */}
        <TabsContent value="tickets">
          <Card className="border-none shadow-sm shadow-slate-200/50 overflow-hidden">
            <div className="flex justify-end p-3 border-b border-slate-50">
              <Button size="sm" variant="outline" className="gap-2 text-xs rounded-xl" onClick={exportTicketsCSV}>
                <Download className="w-3.5 h-3.5" /> CSV
              </Button>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-slate-50/50">
                  <TableRow>
                    <TableHead className="data-grid-header">Empleado</TableHead>
                    <TableHead className="data-grid-header">Fecha</TableHead>
                    <TableHead className="data-grid-header">Proveedor</TableHead>
                    <TableHead className="data-grid-header">CIF</TableHead>
                    <TableHead className="data-grid-header">Cat.</TableHead>
                    <TableHead className="data-grid-header">Total</TableHead>
                    <TableHead className="data-grid-header">Estado</TableHead>
                    <TableHead className="data-grid-header text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.tickets.length === 0 ? (
                    <TableRow><TableCell colSpan={8} className="text-center py-12 text-slate-300">
                      <Filter className="w-5 h-5 mx-auto mb-2" /> Sin registros
                    </TableCell></TableRow>
                  ) : filtered.tickets.map(ticket => {
                    const cat = TICKET_CATEGORIES.find(c => c.value === ticket.category);
                    return (
                      <TableRow key={ticket.id} className="hover:bg-slate-50/50 transition-colors">
                        <TableCell className="data-grid-cell font-bold text-slate-900">{ticket.userName || 'Usuario'}</TableCell>
                        <TableCell className="data-grid-cell">{format(ticket.date.toDate(), 'dd MMM', { locale: es })}</TableCell>
                        <TableCell className="data-grid-cell max-w-[120px] truncate text-slate-600 text-xs">
                          {ticket.vendorName || <span className="text-slate-300 italic">—</span>}
                        </TableCell>
                        <TableCell className="data-grid-cell font-mono text-xs text-slate-500">
                          {ticket.vendorCIF || <span className="text-slate-300">—</span>}
                        </TableCell>
                        <TableCell className="data-grid-cell text-sm">{cat ? cat.emoji : '📋'}</TableCell>
                        <TableCell className="data-grid-cell font-mono font-bold text-emerald-700">{ticket.amount.toFixed(2)} €</TableCell>
                        <TableCell className="data-grid-cell">{getStatusBadge(ticket.status)}</TableCell>
                        <TableCell className="data-grid-cell">
                          <div className="flex justify-end gap-1">
                            <TicketDetailModal ticket={ticket} />
                            {ticket.status === 'pending' ? (
                              <>
                                <Button size="sm" className="gap-1 rounded-xl bg-slate-900 hover:bg-slate-800 text-xs px-2.5 h-8"
                                  onClick={() => processTicket(ticket)} disabled={processing === ticket.id}>
                                  {processing === ticket.id
                                    ? <Sparkles className="w-3.5 h-3.5 animate-spin" />
                                    : <><Sparkles className="w-3.5 h-3.5" /> Procesar</>}
                                </Button>
                                <Button size="sm" variant="outline" className="h-8 w-8 p-0 rounded-xl text-rose-600 hover:bg-rose-50 border-rose-100"
                                  onClick={() => setConfirmReject({ type: 'tickets', id: ticket.id, label: `${ticket.amount.toFixed(2)} € de ${ticket.userName}` })}>
                                  <X className="h-4 w-4" />
                                </Button>
                              </>
                            ) : (
                              <Button size="sm" variant="ghost" className="h-8 w-8 p-0 rounded-xl text-slate-400 hover:text-primary"
                                onClick={() => generatePDF(ticket)} title="PDF">
                                <Download className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
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

      {/* Confirm reject dialog */}
      <Dialog open={!!confirmReject} onOpenChange={v => { if (!v) setConfirmReject(null); }}>
        <DialogContent className="sm:max-w-[380px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-600">
              <AlertTriangle className="w-5 h-5" /> Confirmar rechazo
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-600 py-2">
            ¿Rechazar el registro <span className="font-bold">{confirmReject?.label}</span>?
            El empleado podrá ver el estado actualizado.
          </p>
          <DialogFooter className="gap-2">
            <Button variant="outline" className="rounded-xl" onClick={() => setConfirmReject(null)}>Cancelar</Button>
            <Button variant="destructive" className="rounded-xl" onClick={() => {
              if (confirmReject) { updateStatus(confirmReject.type, confirmReject.id, 'rejected'); setConfirmReject(null); }
            }}>Sí, rechazar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
