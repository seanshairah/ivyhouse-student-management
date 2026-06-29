import type {
  House,
  Room,
  StudentProfile,
  Application,
  Invoice,
  Payment,
  UserRole,
} from "@prisma/client";

export type { UserRole };

export interface HouseWithRooms extends House {
  rooms: Room[];
}

export interface RoomWithHouse extends Room {
  house: House;
}

export interface ApplicationWithRelations extends Application {
  house: House;
  room: Room | null;
  studentProfile: StudentProfile | null;
}

export interface StudentWithRelations extends StudentProfile {
  house: House | null;
  room: Room | null;
  invoices: Invoice[];
  payments: Payment[];
}

export interface ActionResult<T = unknown> {
  success: boolean;
  message?: string;
  error?: string;
  data?: T;
}

export interface NavItem {
  label: string;
  href: string;
  icon: string;
}
