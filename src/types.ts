export type Role = 'admin' | 'user';
export type Status = 'pending' | 'approved' | 'rejected';

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
  date: any; // Firestore Timestamp
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
  date: any; // Firestore Timestamp
  amount: number;
  photoUrl?: string;
  status: Status;
  description?: string;
  userName?: string;
}
