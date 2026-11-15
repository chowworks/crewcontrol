import { DEFAULT_TIME_ZONE } from '@cc/types'

/**
 * The trip editor's time zones (issue #88): where friend groups go, in plain words. A trip saved with another zone
 * keeps it, shown by its own name.
 */
export const TIME_ZONES: { value: string; label: string }[] = [
  { value: 'Pacific/Honolulu', label: 'Hawaii' },
  { value: 'America/Anchorage', label: 'Alaska' },
  { value: 'America/Los_Angeles', label: 'Pacific (Los Angeles, Las Vegas)' },
  { value: 'America/Phoenix', label: 'Arizona' },
  { value: 'America/Denver', label: 'Mountain (Denver)' },
  { value: 'America/Chicago', label: 'Central (Chicago, Houston)' },
  { value: 'America/New_York', label: 'Eastern (New York, Atlanta, Miami)' },
  { value: 'America/Puerto_Rico', label: 'Atlantic (Puerto Rico, Aruba, St. Thomas)' },
  { value: 'America/Nassau', label: 'Bahamas' },
  { value: 'America/Jamaica', label: 'Jamaica' },
  { value: 'America/Cancun', label: 'Cancún, Tulum' },
  { value: 'America/Mexico_City', label: 'Mexico City' },
  { value: 'America/Costa_Rica', label: 'Costa Rica' },
  { value: 'America/Bogota', label: 'Colombia' },
  { value: 'America/Sao_Paulo', label: 'Brazil (São Paulo, Rio)' },
  { value: 'Europe/London', label: 'UK, Portugal' },
  { value: 'Europe/Paris', label: 'Central Europe (Paris, Rome, Barcelona)' },
  { value: 'Europe/Athens', label: 'Greece' },
  { value: 'Africa/Accra', label: 'Ghana' },
  { value: 'Africa/Lagos', label: 'Nigeria' },
  { value: 'Africa/Cairo', label: 'Egypt' },
  { value: 'Africa/Johannesburg', label: 'South Africa' },
  { value: 'Asia/Dubai', label: 'Dubai' },
  { value: 'Asia/Bangkok', label: 'Thailand' },
  { value: 'Asia/Makassar', label: 'Bali' },
  { value: 'Asia/Tokyo', label: 'Japan' },
]

/** A new trip starts on the organizer's own clock when the list has it, else New York time. */
export function deviceTimeZone(): string {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
    return TIME_ZONES.some((z) => z.value === zone) ? zone : DEFAULT_TIME_ZONE
  } catch {
    return DEFAULT_TIME_ZONE
  }
}

/** The list for a trip: its own zone first when the list doesn't have it. */
export const timeZoneOptions = (current: string) =>
  TIME_ZONES.some((z) => z.value === current)
    ? TIME_ZONES
    : [{ value: current, label: current.replace(/_/g, ' ') }, ...TIME_ZONES]
