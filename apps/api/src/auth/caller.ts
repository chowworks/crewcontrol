/** Who is calling an organizer endpoint, as the sign-in guard found them. */
export interface Caller {
  userId: string
  isAdmin: boolean
}
