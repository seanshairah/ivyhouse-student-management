import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const bookingSchema = z.object({
  fullName: z.string().min(2, "Full name is required"),
  email: z.string().email("Enter a valid email"),
  phone: z.string().min(7, "Enter a valid phone number"),
  nationalId: z.string().optional().or(z.literal("")),
  age: z.coerce.number().int().min(16, "Must be at least 16").max(80).optional(),
  gender: z.string().optional().or(z.literal("")),
  institution: z.string().min(2, "Institution is required"),
  program: z.string().optional().or(z.literal("")),
  yearOfStudy: z.string().optional().or(z.literal("")),
  houseId: z.string().min(1, "Select a house"),
  roomId: z.string().optional().or(z.literal("")),
  nextOfKinName: z.string().min(2, "Next of kin name is required"),
  nextOfKinPhone: z.string().min(7, "Next of kin phone is required"),
  nextOfKinRelation: z.string().min(2, "Relationship is required"),
  guardianName: z.string().optional().or(z.literal("")),
  guardianPhone: z.string().optional().or(z.literal("")),
  specialNotes: z.string().optional().or(z.literal("")),
  medicalNeeds: z.string().optional().or(z.literal("")),
  agreedToTerms: z
    .boolean()
    .refine((v) => v === true, "You must agree to the terms"),
});
export type BookingInput = z.infer<typeof bookingSchema>;

export const roomSchema = z.object({
  houseId: z.string().min(1),
  number: z.string().min(1, "Room number is required"),
  name: z.string().optional().or(z.literal("")),
  type: z.enum(["SINGLE", "SHARED_DOUBLE", "SHARED_TRIPLE", "ENSUITE", "STUDIO"]),
  capacity: z.coerce.number().int().min(1).max(10),
  price: z.coerce.number().min(0),
  status: z.enum([
    "AVAILABLE",
    "PENDING_APPLICATION",
    "RESERVED",
    "OCCUPIED",
    "MAINTENANCE",
    "UNAVAILABLE",
  ]),
  floor: z.string().optional().or(z.literal("")),
  description: z.string().optional().or(z.literal("")),
});
export type RoomInput = z.infer<typeof roomSchema>;

export const messageSchema = z.object({
  group: z.enum([
    "ALL_STUDENTS",
    "HOUSE",
    "UNPAID",
    "APPROVED",
    "PAYMENT_PENDING",
    "CARETAKERS",
    "CUSTOM",
  ]),
  houseId: z.string().optional().or(z.literal("")),
  channels: z.array(z.enum(["EMAIL", "SMS"])).min(1, "Choose at least one channel"),
  subject: z.string().optional().or(z.literal("")),
  body: z.string().min(2, "Message body is required"),
});
export type MessageInput = z.infer<typeof messageSchema>;

export const serviceRequestSchema = z.object({
  title: z.string().min(2, "Title is required"),
  description: z.string().min(2, "Description is required"),
  category: z.enum([
    "MAINTENANCE",
    "CLEANING",
    "UTILITY",
    "SECURITY",
    "REPAIR",
    "OTHER",
  ]),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]),
  houseId: z.string().optional().or(z.literal("")),
});
export type ServiceRequestInput = z.infer<typeof serviceRequestSchema>;

export const announcementSchema = z.object({
  title: z.string().min(2, "Title is required"),
  body: z.string().min(2, "Body is required"),
  audience: z.enum(["ALL", "HOUSE", "CARETAKERS", "UNPAID", "APPROVED", "CUSTOM"]),
  houseId: z.string().optional().or(z.literal("")),
  channels: z.array(z.enum(["EMAIL", "SMS", "DASHBOARD"])).min(1),
});
export type AnnouncementInput = z.infer<typeof announcementSchema>;

export const reviewSchema = z.object({
  applicationId: z.string().min(1),
  action: z.enum(["approve", "reject", "request_info"]),
  roomId: z.string().optional().or(z.literal("")),
  amount: z.coerce.number().optional(),
  reason: z.string().optional().or(z.literal("")),
});
export type ReviewInput = z.infer<typeof reviewSchema>;
