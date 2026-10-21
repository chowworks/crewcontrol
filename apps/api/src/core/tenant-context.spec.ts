import { contextMarks } from '../prisma/prisma.service'
import {
  identifyAdmin,
  identifyCaller,
  runAsPublic,
  runAsSystem,
  tenantContext,
  withTenantContext,
} from './tenant-context'

/** When each mark (app.system, app.admin, app.public) is set, and every way it is turned off. */
describe('the context marks', () => {
  it('sets the admin mark for a verified caller the guard marked, beside their own id and alone', () => {
    withTenantContext(() => {
      identifyCaller({ userId: 'user_admin' })
      identifyAdmin()
      expect(contextMarks(tenantContext()!)).toEqual({ system: '', admin: 'on', public: '' })
    })
  })

  it('sets only the system mark inside runAsSystem, even nested in an admin request', () => {
    withTenantContext(() => {
      identifyCaller({ userId: 'user_admin' })
      identifyAdmin()
      runAsSystem(() => {
        expect(tenantContext()).toEqual({ allTrips: true })
        expect(contextMarks(tenantContext()!)).toEqual({ system: 'on', admin: '', public: '' })
      })
    })
    // A context that somehow carried every mark would still set only the system mark.
    expect(contextMarks({ userId: 'u', admin: true, allTrips: true, public: true }).admin).toBe('')
    expect(contextMarks({ allTrips: true, public: true })).toEqual({
      system: 'on',
      admin: '',
      public: '',
    })
  })

  it('sets the public mark only with no person and no trusted work', () => {
    runAsPublic(() => {
      expect(contextMarks(tenantContext()!)).toEqual({ system: '', admin: '', public: 'on' })
    })
    expect(contextMarks({ public: true, userId: 'u' }).public).toBe('')
  })

  it('resets the admin and public marks with identifyCaller', () => {
    withTenantContext(() => {
      identifyCaller({ userId: 'user_admin' })
      identifyAdmin()
      identifyCaller({ userId: 'user_admin' })
      expect(tenantContext()?.admin).toBe(false)
      expect(contextMarks(tenantContext()!).admin).toBe('')
    })
    withTenantContext(
      () => {
        identifyCaller({ userId: 'u' })
        expect(contextMarks(tenantContext()!).public).toBe('')
      },
      { public: true }
    )
  })

  it('does not set the admin mark without a verified caller', () => {
    withTenantContext(() => {
      identifyAdmin()
      expect(tenantContext()?.admin).toBeUndefined()
      expect(contextMarks(tenantContext()!).admin).toBe('')
    })
    // Nor outside a request.
    expect(() => identifyAdmin()).not.toThrow()
    expect(tenantContext()).toBeUndefined()
  })
})
