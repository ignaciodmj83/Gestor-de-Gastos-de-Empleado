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

export interface OrgSettings {
  organizationId: string;
  // Km cost
  kmCost: number;               // €/km, e.g. 0.26
  // Fiscal / company data
  companyName?: string;
  companyAddress?: string;
  companyCIF?: string;
  companyEmail?: string;
  // Email routing for automatic sends
  emailTicketsSmall?: string;   // tickets < maxAutoApproveAmount
  emailTicketsLarge?: string;   // tickets >= maxAutoApproveAmount
  emailTrips?: string;          // trips
  defaultSendEmail?: string;    // fallback (backwards compat)
  maxAutoApproveAmount?: number; // tickets below this are auto-approved (default 50)
  currency: string;             // default 'EUR'
}

export const DEFAULT_SETTINGS: OrgSettings = {
  organizationId: '',
  kmCost: 0.26,
  companyName: '',
  companyAddress: '',
  companyCIF: '',
  companyEmail: '',
  emailTicketsSmall: '',
  emailTicketsLarge: '',
  emailTrips: '',
  defaultSendEmail: '',
  maxAutoApproveAmount: 50,
  currency: 'EUR',
};

export interface Trip {
  id: string;
  userId: string;
  organizationId: string;
  date: any;
  km: number;
  kmCost?: number;       // snapshot of cost at submission time
  totalAmount?: number;  // km * kmCost
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
  baseAmount?: number;   // amount before VAT
  vatPercent?: number;   // e.g. 21
  vatAmount?: number;    // calculated VAT
  category?: TicketCategory;
  // Fiscal data extracted by AI
  vendorName?: string;
  vendorAddress?: string;
  vendorCIF?: string;
  concept?: string;
  invoiceNumber?: string;
  photoUrl?: string;
  status: Status;
  description?: string;  // kept for backwards compat
  userName?: string;
}
