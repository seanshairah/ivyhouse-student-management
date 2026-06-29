export interface SeedRoom {
  number: string;
  name?: string;
  type: "SINGLE" | "SHARED_DOUBLE" | "SHARED_TRIPLE" | "ENSUITE" | "STUDIO";
  capacity: number;
  price: number;
  floor?: string;
  status?: "AVAILABLE" | "OCCUPIED" | "MAINTENANCE";
  amenities?: string[];
}

export interface SeedHouse {
  name: string;
  slug: string;
  tagline: string;
  description: string;
  location: string;
  imageUrl: string;
  images: string[];
  amenities: string[];
  services: string[];
  rules: string[];
  safetyInfo: string[];
  rooms: SeedRoom[];
}

export const seedHouses: SeedHouse[] = [
  {
    name: "Ivy House",
    slug: "ivy-house",
    tagline: "Secure, verified student living a short walk from the main campus.",
    description:
      "Ivy House is a purpose-built student residence in Chinhoyi, minutes from the Chinhoyi University of Technology main campus. Light-filled rooms, fast Wi-Fi, backup power and on-site care make it an easy, focused place to call home — with transparent pricing and everything managed online.",
    location: "Off Magamba Way, Chinhoyi — 6 min walk to CUT main campus",
    imageUrl:
      "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=1400&q=80",
    images: [
      "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=1400&q=80",
      "https://images.unsplash.com/photo-1493809842364-78817add7ffb?auto=format&fit=crop&w=1400&q=80",
      "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=1400&q=80",
      "https://images.unsplash.com/photo-1556911220-bff31c812dba?auto=format&fit=crop&w=1400&q=80",
      "https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?auto=format&fit=crop&w=1400&q=80",
    ],
    amenities: [
      "High-speed Wi-Fi",
      "Backup power",
      "Hot water 24/7",
      "Study lounge",
      "Communal kitchen",
      "Laundry room",
      "Secure parking",
      "Landscaped garden",
    ],
    services: [
      "On-site caretaker",
      "Weekly cleaning of common areas",
      "Maintenance on request",
      "Borehole water supply",
      "Refuse collection",
    ],
    rules: [
      "Quiet hours from 22:00 to 06:00",
      "No subletting of rooms",
      "Visitors sign in at reception",
      "Keep shared spaces clean",
      "Respect fellow residents",
    ],
    safetyInfo: [
      "24/7 perimeter security",
      "CCTV at entrances",
      "Electric fence",
      "Fire extinguishers on each floor",
      "Emergency contact list posted",
    ],
    rooms: [
      { number: "IVY-101", type: "SINGLE", capacity: 1, price: 180, floor: "Ground" },
      { number: "IVY-102", type: "SINGLE", capacity: 1, price: 180, floor: "Ground" },
      { number: "IVY-103", type: "ENSUITE", capacity: 1, price: 240, floor: "Ground" },
      { number: "IVY-104", type: "SHARED_DOUBLE", capacity: 2, price: 130, floor: "Ground" },
      { number: "IVY-201", type: "SHARED_DOUBLE", capacity: 2, price: 130, floor: "First" },
      { number: "IVY-202", type: "SINGLE", capacity: 1, price: 185, floor: "First" },
      { number: "IVY-203", type: "ENSUITE", capacity: 1, price: 235, floor: "First" },
      { number: "IVY-204", type: "STUDIO", capacity: 1, price: 300, floor: "First" },
      { number: "IVY-301", type: "SHARED_TRIPLE", capacity: 3, price: 110, floor: "Second" },
      { number: "IVY-302", type: "SINGLE", capacity: 1, price: 185, floor: "Second" },
    ],
  },
];

export const faqs = [
  {
    q: "How do I apply for a room?",
    a: "Browse Ivy House, pick an available room, and complete the booking form. You'll get an instant confirmation and we'll review your application within 1–2 days.",
  },
  {
    q: "When do I pay?",
    a: "Once your application is approved, you'll receive a secure payment link by email and in your student portal. Your room is reserved while you complete payment.",
  },
  {
    q: "What's included in the rent?",
    a: "Wi-Fi, water, backup power, common-area cleaning, and access to all shared facilities are included. The full amenities list is on the Ivy House page.",
  },
  {
    q: "How close is it to campus?",
    a: "Ivy House is about a 6-minute walk from the Chinhoyi University of Technology main campus, so you're never far from lectures, the library or the bus route.",
  },
  {
    q: "Is there security?",
    a: "Yes. Ivy House has 24/7 security measures including controlled access, CCTV at entrances, an electric fence, and an on-site caretaker.",
  },
  {
    q: "Can I choose my roommate?",
    a: "For shared rooms you can note a preferred roommate in the special notes field and we'll do our best to accommodate.",
  },
  {
    q: "What if I need to move out?",
    a: "Speak to management. We'll guide you through notice periods and any balance settlement via your statement.",
  },
];

export const howItWorks = [
  {
    title: "Search by room",
    description:
      "Explore Ivy House, view amenities and live availability, and find a room that fits your budget.",
  },
  {
    title: "Apply online",
    description:
      "Pick an available room and submit the booking form in minutes. The room is held while we review.",
  },
  {
    title: "Get approved",
    description:
      "We review your application and notify you by email and SMS. Approved? A payment link is generated automatically.",
  },
  {
    title: "Pay securely",
    description:
      "Complete payment via Paynow. Your receipt and invoice are generated and emailed instantly.",
  },
  {
    title: "Move in",
    description:
      "Collect your keys and settle in. Manage everything from your student portal afterwards.",
  },
];
