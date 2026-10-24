import { Route, Routes } from 'react-router-dom'
import { RequireSignIn } from './lib/auth'
import { AdminPage } from './pages/AdminPage'
import { AdminTripsPage } from './pages/AdminTripsPage'
import { ContactPage } from './pages/ContactPage'
import { ControlPanelPage } from './pages/ControlPanelPage'
import { EditTripPage } from './pages/EditTripPage'
import { FaqPage } from './pages/FaqPage'
import { GuestTripPage } from './pages/GuestTripPage'
import { HomePage } from './pages/HomePage'
import { JoinPage } from './pages/JoinPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { PrivacyPage } from './pages/PrivacyPage'
import { SignInPage } from './pages/SignInPage'
import { TripsPage } from './pages/TripsPage'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route
        path="/organize"
        element={
          <RequireSignIn>
            <TripsPage />
          </RequireSignIn>
        }
      />
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route path="/faq" element={<FaqPage />} />
      <Route path="/contact" element={<ContactPage />} />
      <Route path="/t/:slug" element={<GuestTripPage />} />
      <Route
        path="/t/:slug/join"
        element={
          <RequireSignIn>
            <JoinPage />
          </RequireSignIn>
        }
      />
      <Route
        path="/organize/new"
        element={
          <RequireSignIn>
            <EditTripPage />
          </RequireSignIn>
        }
      />
      <Route
        path="/organize/:id"
        element={
          <RequireSignIn>
            <EditTripPage />
          </RequireSignIn>
        }
      />
      <Route
        path="/organize/:id/control"
        element={
          <RequireSignIn>
            <ControlPanelPage />
          </RequireSignIn>
        }
      />
      <Route
        path="/admin"
        element={
          <RequireSignIn>
            <AdminPage />
          </RequireSignIn>
        }
      />
      <Route
        path="/admin/trips"
        element={
          <RequireSignIn>
            <AdminTripsPage />
          </RequireSignIn>
        }
      />
      <Route path="/sign-in/*" element={<SignInPage />} />
      <Route path="/sign-up/*" element={<SignInPage mode="sign-up" />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}
