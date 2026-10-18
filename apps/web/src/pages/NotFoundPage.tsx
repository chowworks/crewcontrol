import { Link } from 'react-router-dom'

export function NotFoundPage({ message = "We couldn't find that page." }: { message?: string }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-5 text-center">
      <h1 className="text-3xl font-extrabold">Nothing here</h1>
      <p className="text-muted">{message}</p>
      <Link to="/" className="font-semibold text-royal hover:text-royal-dark">
        Back to CrewControl
      </Link>
    </main>
  )
}
