import {
  Building2,
  Droplets,
  Fence,
  Home,
  LayoutDashboard,
  LockKeyhole,
  LucideIcon,
  Microwave,
  PaintBucket,
  Thermometer,
  Zap,
} from 'lucide-react';

export const THREE_SIXTY_PROPERTY_SYSTEMS = [
  { key: 'roof', label: 'Roof & Gutters', icon: Home, description: 'Roofing, gutters, downspouts, and roof drainage.' },
  { key: 'exterior_siding', label: 'Exterior Envelope', icon: PaintBucket, description: 'Siding, trim, paint, windows, doors, and exterior seals.' },
  { key: 'foundation', label: 'Foundation & Structure', icon: Building2, description: 'Foundation, framing concerns, crawlspace, basement, and structural movement.' },
  { key: 'landscaping_drainage', label: 'Drainage & Grounds', icon: Fence, description: 'Grading, drainage paths, hardscape, vegetation clearance, and exterior water control.' },
  { key: 'hvac', label: 'HVAC', icon: Thermometer, description: 'Heating, ventilation, cooling, filters, service history, and comfort systems.' },
  { key: 'plumbing', label: 'Plumbing', icon: Droplets, description: 'Supply lines, drains, fixtures, water heater, visible leaks, and freeze risk.' },
  { key: 'electrical', label: 'Electrical', icon: Zap, description: 'Panel, breakers, outlets, visible wiring, lighting, and safety concerns.' },
  { key: 'interior', label: 'Interior Finishes', icon: LayoutDashboard, description: 'Walls, ceilings, flooring, trim, attic insulation, and interior moisture evidence.' },
  { key: 'appliances', label: 'Appliances', icon: Microwave, description: 'Major appliances, built-ins, service condition, and replacement planning.' },
  { key: 'safety_security', label: 'Safety & Security', icon: LockKeyhole, description: 'Smoke/CO protection, handrails, trip risks, fire extinguishers, locks, and access safety.' },
] as const;

export type ThreeSixtyPropertySystemKey = typeof THREE_SIXTY_PROPERTY_SYSTEMS[number]['key'];

export const THREE_SIXTY_SYSTEM_KEYS = THREE_SIXTY_PROPERTY_SYSTEMS.map(system => system.key) as [
  ThreeSixtyPropertySystemKey,
  ...ThreeSixtyPropertySystemKey[],
];

export const THREE_SIXTY_SYSTEM_LABELS: Record<ThreeSixtyPropertySystemKey, string> =
  Object.fromEntries(THREE_SIXTY_PROPERTY_SYSTEMS.map(system => [system.key, system.label])) as Record<
    ThreeSixtyPropertySystemKey,
    string
  >;

export function normalizeThreeSixtySystemKey(value?: string | null): ThreeSixtyPropertySystemKey {
  if (value === 'landscaping') return 'landscaping_drainage';
  if (value === 'safety') return 'safety_security';
  if (THREE_SIXTY_SYSTEM_KEYS.includes(value as ThreeSixtyPropertySystemKey)) {
    return value as ThreeSixtyPropertySystemKey;
  }
  return 'interior';
}
