// The organizer screens have no login yet. Say so wherever they show, so nobody mistakes the prototype for the product.
export function PrototypeBanner() {
  return (
    <div className="bg-marigold px-5 py-2 text-center text-sm font-semibold text-ink">
      Prototype: organizer screens have no login yet, so anyone with this link can edit trips.
    </div>
  )
}
