import { AsyncLocalStorage } from 'node:async_hooks'

/**
 * Who a request acts as. A request opens an empty context (TenantMiddleware); the guard that verifies the caller
 * fills it in with `identifyCaller` before anything else touches the database, and a public route says so with
 * `runAsPublic`. Nothing outside a request has a context, so background work must say what it acts as
 * (`runAsSystem`). PrismaService reads it to set the caller's id and trips on every query for row-level security.
 */
export interface TenantContext {
  userId?: string
  /** Sees every trip: trusted work. */
  allTrips?: boolean
  /** The platform admin, on a route a guard let through after checking the Clerk role: trip level only. */
  admin?: boolean
  /** A public page: published trips, no person. */
  public?: boolean
}

const store = new AsyncLocalStorage<TenantContext>()

export function tenantContext(): TenantContext | undefined {
  return store.getStore()
}

/** Opens a fresh, empty context for the work done inside `fn`. */
export function withTenantContext<T>(fn: () => T, initial: TenantContext = {}): T {
  return store.run({ ...initial }, fn)
}

/**
 * Says who the current request acts as. Call it as soon as a guard has verified the caller. A request is always one
 * person in their own trips: nothing a guard learns can widen that (runAsSystem is for code that runs outside a
 * request).
 */
export function identifyCaller(who: { userId: string }): void {
  const ctx = store.getStore()
  if (!ctx) return
  ctx.userId = who.userId
  ctx.allTrips = false
  ctx.admin = false
  ctx.public = false
}

/**
 * Marks the current request as the platform admin's. Only the admin guard calls it, after identifyCaller and after
 * Clerk's backend said the caller's role is admin. PrismaService then sets app.admin = 'on' beside the admin's own
 * user id and trips (migration 20261021050000_trip_rls): every trip and its people, never its guests.
 */
export function identifyAdmin(): void {
  const ctx = store.getStore()
  if (!ctx?.userId) return
  ctx.admin = true
}

/** Runs `fn` seeing every trip. For audited, trusted code paths only (trusted-paths.spec.ts lists them). */
export function runAsSystem<T>(fn: () => T): T {
  return store.run({ allTrips: true }, fn)
}

/** Runs `fn` as a public page: published trips, their approved guests, and sign-ups. No person. */
export function runAsPublic<T>(fn: () => T): T {
  return store.run({ public: true }, fn)
}
