import React, { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot, orderBy, doc, updateDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '@/src/lib/firebase';
import { useAuth } from './AuthProvider';
import { Trip, Ticket, UserProfile } from '@/src/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Users, Car, Receipt, Check, X, Eye, BarChart3, Send, FileText, Share2, Download, Sparkles } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { toast } from 'sonner';
import { jsPDF } from "jspdf";

export function AdminDashboard() {
  const { profile } = useAuth();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [filterUser, setFilterUser] = useState<string>('all');
  const [processing, setProcessing] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) return;

    const tripsQuery = query(
      collection(db, 'trips'),
      where('organizationId', '==', profile.organizationId),
      orderBy('date', 'desc')
    );

    const ticketsQuery = query(
      collection(db, 'tickets'),
      where('organizationId', '==', profile.organizationId),
      orderBy('date', 'desc')
    );

    const usersQuery = query(
      collection(db, 'users'),
      where('organizationId', '==', profile.organizationId)
    );

    const unsubTrips = onSnapshot(tripsQuery, (snapshot) => {
      setTrips(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Trip)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'trips'));

    const unsubTickets = onSnapshot(ticketsQuery, (snapshot) => {
      setTickets(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Ticket)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'tickets'));

    const unsubUsers = onSnapshot(usersQuery, (snapshot) => {
      setUsers(snapshot.docs.map(doc => ({ ...doc.data() } as UserProfile)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'users'));

    return () => {
      unsubTrips();
      unsubTickets();
      unsubUsers();
    };
  }, [profile]);

  const updateStatus = async (type: 'trips' | 'tickets', id: string, status: 'approved' | 'rejected') => {
    try {
      await updateDoc(doc(db, type, id), { status });
      toast.success(`Registro ${status === 'approved' ? 'aprobado' : 'rechazado'}`);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, type);
    }
  };

  const generatePDF = (ticket: Ticket) => {
    const doc = new jsPDF();
    const dateStr = format(ticket.date.toDate(), 'dd/MM/yyyy');
    
    doc.setFontSize(22);
    doc.text("Resumen de Factura", 20, 20);
    
    doc.setFontSize(12);
    doc.text(`Organización: ${profile?.organizationName || profile?.organizationId}`, 20, 40);
    doc.text(`Usuario: ${ticket.userName || 'N/A'}`, 20, 50);
    doc.text(`Fecha: ${dateStr}`, 20, 60);
    doc.text(`Importe: ${ticket.amount.toFixed(2)} €`, 20, 70);
    doc.text(`Descripción: ${ticket.description || 'Sin descripción'}`, 20, 80);
    
    if (ticket.photoUrl) {
      doc.text("Imagen adjunta en el sistema.", 20, 100);
    }
    
    doc.save(`factura_${ticket.id}.pdf`);
    toast.success("PDF generado y descargado");
  };

  const processTicket = async (ticket: Ticket) => {
    setProcessing(ticket.id);
    try {
      if (ticket.amount < 50) {
        // Simulate sending to "recuperacion de iva"
        toast.info(`Enviando ticket de ${ticket.amount}€ a "recuperación de IVA"...`, {
          description: "Proceso automatizado para cuantías inferiores a 50€",
          icon: <Send className="w-4 h-4" />
        });
        await new Promise(resolve => setTimeout(resolve, 1500));
        await updateStatus('tickets', ticket.id, 'approved');
        toast.success("Ticket enviado a recuperación de IVA");
      } else {
        // Generate PDF for amounts >= 50
        toast.info(`Generando resumen de factura para ticket de ${ticket.amount}€...`, {
          icon: <FileText className="w-4 h-4" />
        });
        await new Promise(resolve => setTimeout(resolve, 1000));
        generatePDF(ticket);
        await updateStatus('tickets', ticket.id, 'approved');
      }
    } catch (error) {
      console.error("Error processing ticket:", error);
      toast.error("Error al procesar el ticket");
    } finally {
      setProcessing(null);
    }
  };

  const filteredTrips = filterUser === 'all' ? trips : trips.filter(t => t.userId === filterUser);
  const filteredTickets = filterUser === 'all' ? tickets : tickets.filter(t => t.userId === filterUser);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved': return <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-200 border-none px-3 py-1 rounded-full">Aprobado</Badge>;
      case 'rejected': return <Badge className="bg-rose-100 text-rose-700 hover:bg-rose-200 border-none px-3 py-1 rounded-full">Rechazado</Badge>;
      default: return <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-200 border-none px-3 py-1 rounded-full">Pendiente</Badge>;
    }
  };

  const chartData = users.map(u => {
    const userTrips = trips.filter(t => t.userId === u.uid && t.status === 'approved');
    const userTickets = tickets.filter(t => t.userId === u.uid && t.status === 'approved');
    return {
      name: u.name,
      km: userTrips.reduce((acc, t) => acc + t.km, 0),
      gastos: userTickets.reduce((acc, t) => acc + t.amount, 0),
    };
  });

  return (
    <div className="space-y-8 pb-12">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
        <div className="space-y-1">
          <h2 className="text-3xl font-extrabold tracking-tight text-slate-900">Panel de Administración</h2>
          <p className="text-slate-500">
            Supervisa los recursos de <span className="font-semibold text-slate-700">{profile?.organizationName || 'tu organización'}</span> con IA.
          </p>
        </div>
        <div className="flex items-center gap-3 bg-white p-1.5 rounded-2xl shadow-sm border border-slate-100">
          <div className="p-2 bg-slate-50 rounded-xl">
            <Users className="w-4 h-4 text-slate-400" />
          </div>
          <Select value={filterUser} onValueChange={setFilterUser}>
            <SelectTrigger className="w-[200px] border-none focus:ring-0 shadow-none font-medium">
              <SelectValue placeholder="Filtrar por usuario" />
            </SelectTrigger>
            <SelectContent className="rounded-xl border-slate-100">
              <SelectItem value="all">Todos los usuarios</SelectItem>
              {users.map(u => (
                <SelectItem key={u.uid} value={u.uid}>{u.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[
          { label: 'Usuarios Activos', value: users.length, icon: Users, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'KM Totales', value: `${trips.filter(t => t.status === 'approved').reduce((acc, t) => acc + t.km, 0).toFixed(1)} km`, icon: Car, color: 'text-indigo-600', bg: 'bg-indigo-50' },
          { label: 'Gastos Totales', value: `${tickets.filter(t => t.status === 'approved').reduce((acc, t) => acc + t.amount, 0).toFixed(2)} €`, icon: Receipt, color: 'text-emerald-600', bg: 'bg-emerald-50' }
        ].map((stat, i) => (
          <Card key={i} className="border-none shadow-sm shadow-slate-200/50 overflow-hidden group">
            <CardContent className="p-6 relative">
              <div className={`absolute top-0 right-0 w-24 h-24 ${stat.bg} -mr-8 -mt-8 rounded-full opacity-50 group-hover:scale-110 transition-transform`} />
              <div className="relative flex items-center gap-4">
                <div className={`p-3 ${stat.bg} rounded-2xl`}>
                  <stat.icon className={`w-6 h-6 ${stat.color}`} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-500 uppercase tracking-wider">{stat.label}</p>
                  <p className="text-2xl font-black text-slate-900">{stat.value}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 border-none shadow-sm shadow-slate-200/50 p-6">
          <CardHeader className="px-0 pt-0 pb-6">
            <CardTitle className="text-lg font-bold flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-primary" /> Rendimiento de Equipo
            </CardTitle>
          </CardHeader>
          <div className="h-[350px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} dy={10} />
                <YAxis yAxisId="left" orientation="left" stroke="#6366f1" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                <YAxis yAxisId="right" orientation="right" stroke="#10b981" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                <Tooltip 
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  cursor={{ fill: '#f8fafc' }}
                />
                <Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={{ paddingBottom: '20px' }} />
                <Bar yAxisId="left" dataKey="km" fill="#6366f1" name="Kilómetros" radius={[6, 6, 0, 0]} barSize={24} />
                <Bar yAxisId="right" dataKey="gastos" fill="#10b981" name="Gastos (€)" radius={[6, 6, 0, 0]} barSize={24} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="border-none shadow-sm shadow-slate-200/50 p-6">
          <CardHeader className="px-0 pt-0 pb-4">
            <CardTitle className="text-lg font-bold">Resumen Rápido</CardTitle>
            <CardDescription>Estado de las solicitudes actuales</CardDescription>
          </CardHeader>
          <div className="space-y-4">
            {[
              { label: 'Viajes Pendientes', count: trips.filter(t => t.status === 'pending').length, color: 'bg-amber-500' },
              { label: 'Tickets Pendientes', count: tickets.filter(t => t.status === 'pending').length, color: 'bg-blue-500' },
              { label: 'Total Aprobados', count: trips.filter(t => t.status === 'approved').length + tickets.filter(t => t.status === 'approved').length, color: 'bg-emerald-500' }
            ].map((item, i) => (
              <div key={i} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl">
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

      <Tabs defaultValue="trips" className="w-full">
        <TabsList className="bg-white p-1 rounded-2xl border border-slate-100 shadow-sm mb-6">
          <TabsTrigger value="trips" className="rounded-xl px-6 py-2 data-[state=active]:bg-slate-900 data-[state=active]:text-white transition-all">Viajes</TabsTrigger>
          <TabsTrigger value="tickets" className="rounded-xl px-6 py-2 data-[state=active]:bg-slate-900 data-[state=active]:text-white transition-all">Tickets</TabsTrigger>
        </TabsList>
        
        <TabsContent value="trips">
          <Card className="border-none shadow-sm shadow-slate-200/50 overflow-hidden">
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
                {filteredTrips.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-12 text-slate-400">No hay registros de viajes</TableCell></TableRow>
                ) : filteredTrips.map(trip => (
                  <TableRow key={trip.id} className="hover:bg-slate-50/50 transition-colors group">
                    <TableCell className="data-grid-cell font-bold text-slate-900">{trip.userName || 'Usuario'}</TableCell>
                    <TableCell className="data-grid-cell">{format(trip.date.toDate(), 'dd MMM yyyy', { locale: es })}</TableCell>
                    <TableCell className="data-grid-cell font-mono font-medium">{trip.km} km</TableCell>
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
                        {!trip.startPhotoUrl && !trip.endPhotoUrl && trip.photoUrl && (
                           <Dialog>
                            <DialogTrigger>
                              <div className="w-8 h-8 rounded-lg overflow-hidden border border-slate-200 cursor-pointer hover:opacity-80 transition-opacity">
                                <img src={trip.photoUrl} alt="Foto" className="w-full h-full object-cover" />
                              </div>
                            </DialogTrigger>
                            <DialogContent className="sm:max-w-[600px]">
                              <img src={trip.photoUrl} alt="Evidencia" className="w-full h-auto rounded-xl" />
                            </DialogContent>
                          </Dialog>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="data-grid-cell">{getStatusBadge(trip.status)}</TableCell>
                    <TableCell className="data-grid-cell text-right">
                      {trip.status === 'pending' && (
                        <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button size="sm" variant="outline" className="h-9 w-9 p-0 rounded-xl text-emerald-600 hover:bg-emerald-50 border-emerald-100" onClick={() => updateStatus('trips', trip.id, 'approved')}>
                            <Check className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="outline" className="h-9 w-9 p-0 rounded-xl text-rose-600 hover:bg-rose-50 border-rose-100" onClick={() => updateStatus('trips', trip.id, 'rejected')}>
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </TableCell>
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
                  <TableHead className="data-grid-header">Usuario</TableHead>
                  <TableHead className="data-grid-header">Fecha</TableHead>
                  <TableHead className="data-grid-header">Importe</TableHead>
                  <TableHead className="data-grid-header">Foto</TableHead>
                  <TableHead className="data-grid-header">Estado</TableHead>
                  <TableHead className="data-grid-header text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTickets.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-12 text-slate-400">No hay registros de tickets</TableCell></TableRow>
                ) : filteredTickets.map(ticket => (
                  <TableRow key={ticket.id} className="hover:bg-slate-50/50 transition-colors group">
                    <TableCell className="data-grid-cell font-bold text-slate-900">{ticket.userName || 'Usuario'}</TableCell>
                    <TableCell className="data-grid-cell">{format(ticket.date.toDate(), 'dd MMM yyyy', { locale: es })}</TableCell>
                    <TableCell className="data-grid-cell font-mono font-medium">{ticket.amount.toFixed(2)} €</TableCell>
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
                    <TableCell className="data-grid-cell">{getStatusBadge(ticket.status)}</TableCell>
                    <TableCell className="data-grid-cell text-right">
                      {ticket.status === 'pending' ? (
                        <div className="flex justify-end gap-2">
                          <Button 
                            size="sm" 
                            className="gap-2 rounded-xl bg-slate-900 hover:bg-slate-800 shadow-md shadow-slate-200"
                            onClick={() => processTicket(ticket)}
                            disabled={processing === ticket.id}
                          >
                            {processing === ticket.id ? <Sparkles className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                            Procesar
                          </Button>
                          <Button size="sm" variant="outline" className="h-9 w-9 p-0 rounded-xl text-rose-600 hover:bg-rose-50 border-rose-100" onClick={() => updateStatus('tickets', ticket.id, 'rejected')}>
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <div className="flex justify-end gap-2">
                           <Button size="sm" variant="ghost" className="h-9 w-9 p-0 rounded-xl text-slate-400 hover:text-primary" onClick={() => generatePDF(ticket)}>
                            <Download className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="ghost" className="h-9 w-9 p-0 rounded-xl text-slate-400 hover:text-primary">
                            <Share2 className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
