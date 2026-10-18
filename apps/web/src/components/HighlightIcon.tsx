import type { HighlightIcon as Icon } from '@cc/types'
import {
  Car,
  Home,
  Hotel,
  type LucideIcon,
  Plane,
  Ship,
  Sparkles,
  Star,
  Umbrella,
  UtensilsCrossed,
  Wine,
} from 'lucide-react'

export const HIGHLIGHT_ICON_LABELS: Record<Icon, string> = {
  home: 'House',
  hotel: 'Hotel or resort',
  beach: 'Beach',
  plane: 'Flight',
  ferry: 'Boat or ferry',
  car: 'Car or transfer',
  food: 'Food',
  drink: 'Drinks or party',
  activity: 'Activity',
  star: 'Other',
}

const ICONS: Record<Icon, LucideIcon> = {
  home: Home,
  hotel: Hotel,
  beach: Umbrella,
  plane: Plane,
  ferry: Ship,
  car: Car,
  food: UtensilsCrossed,
  drink: Wine,
  activity: Sparkles,
  star: Star,
}

export function HighlightIcon({ icon, className }: { icon: Icon; className?: string }) {
  const Component = ICONS[icon]
  return <Component className={className} aria-hidden="true" strokeWidth={2} />
}
