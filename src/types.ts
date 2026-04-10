export type Role = 'admin' | 'user';
export type Status = 'pending' | 'approved' | 'rejected';
export type TicketCategory =
  | 'comida'
  | 'transporte'
  | 'alojamiento'
  | 'combustible'
  | 'material_oficina'
  | 'otros';

export const TICKET_CATEGORIES: { value: TicketCategory; label: string; emoji: string }[] = [
  { value: 'comida',           label: 'Comida',           emoji: '🍽️' },
  { value: 'transporte',       label: 'Transporte',       emoji: '🚌' },
  { value: 'alojamiento',      label: 'Alojamiento',      emoji: '🏨' },
  { value: 'combustible',      label: 'Combustible',      emoji: '⛽' },
  { value: 'material_oficina', label: 'Material oficina', emoji: '📎' },
  { value: 'otros',            label: 'Otros',            emoji: '📋' },
];

export interface Organization {
  id: string;
  name: string;
  adminUid: string;
}

export interface UserProfile {
  uid: string;
  email: string;
  name: string;
  organizationId: string;
  organizationName?: string;
  role: Role;
}

export interface Trip {
  id: string;
  userId: string;
  organizationId: string;
  date: any;
  km: number;
  startKm?: number;
  endKm?: number;
  startPhotoUrl?: string;
  endPhotoUrl?: string;
  photoUrl?: string;
  status: Status;
  description?: string;
  userName?: string;
}

export interface Ticket {
  id: string;
  userId: string;
  organizationId: string;
  date: any;
  amount: number;
  category?: TicketCategory;
  photoUrl?: string;
  status: Status;
  description?: string;
  userName?: string;
}
