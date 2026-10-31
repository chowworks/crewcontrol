import { useUser } from '@clerk/clerk-react'
import { Route, Routes } from 'react-router-dom'
import { AdminView } from './components/AdminView'
import { OrganizerTerms } from './components/OrganizerTerms'
import { RequireSignIn, useIsAdmin } from './lib/auth'
import { AdminPage } from './pages/AdminPage'
import { AdminEmailProblemsPage } from './pages/AdminEmailProblemsPage'
import { AdminForwardedReceiptsPage } from './pages/AdminForwardedReceiptsPage'
import { AdminEmailPage, AdminEmailsPage } from './pages/AdminEmailsPage'
import { AdminRequestsPage } from './pages/AdminRequestsPage'
import { AdminSettingsPage } from './pages/AdminSettingsPage'
import { AdminTripsPage } from './pages/AdminTripsPage'
import { ContactPage } from './pages/ContactPage'
import { ControlPanelPage } from './pages/ControlPanelPage'
import { EditTripPage } from './pages/EditTripPage'
import { FaqPage } from './pages/FaqPage'
import { GuestTripPage } from './pages/GuestTripPage'
import { HomePage } from './pages/HomePage'
import { JoinPage } from './pages/JoinPage'
import { LimitedPreviewPage } from './pages/LimitedPreviewPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { PeoplePage } from './pages/PeoplePage'
import { PrivacyPage } from './pages/PrivacyPage'
import { SignInPage } from './pages/SignInPage'
import { StopUpdatesPage } from './pages/StopUpdatesPage'
import { TermsPage } from './pages/TermsPage'
import { TripsPage } from './pages/TripsPage'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route
        path="/organize"
        element={
          <RequireSignIn>
            <OrganizerTerms>
              <TripsPage />
            </OrganizerTerms>
          </RequireSignIn>
        }
      />
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route path="/terms" element={<TermsPage />} />
      <Route path="/faq" element={<FaqPage />} />
      <Route path="/contact" element={<ContactPage />} />
      <Route path="/stop/:token" element={<StopUpdatesPage />} />
      <Route path="/t/:slug" element={<GuestTripPage />} />
      <Route
        path="/t/:slug/join"
        element={
          <RequireSignIn>
            <JoinPage />
          </RequireSignIn>
        }
      />
      <Route path="/organize/new" element={<NewTrip />} />
      <Route
        path="/organize/:id"
        element={
          <RequireSignIn>
            <OrganizerTerms>
              <EditTripPage />
            </OrganizerTerms>
          </RequireSignIn>
        }
      />
      <Route
        path="/organize/:id/control"
        element={
          <RequireSignIn>
            <OrganizerTerms>
              <ControlPanelPage />
            </OrganizerTerms>
          </RequireSignIn>
        }
      />
      <Route
        path="/organize/:id/people"
        element={
          <RequireSignIn>
            <OrganizerTerms>
              <PeoplePage />
            </OrganizerTerms>
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
      <Route
        path="/admin/trips/:id/control"
        element={
          <RequireSignIn>
            <AdminView.Provider value>
              <ControlPanelPage />
            </AdminView.Provider>
          </RequireSignIn>
        }
      />
      <Route
        path="/admin/trips/:id/edit"
        element={
          <RequireSignIn>
            <AdminView.Provider value>
              <EditTripPage />
            </AdminView.Provider>
          </RequireSignIn>
        }
      />
      <Route
        path="/admin/trips/:id/people"
        element={
          <RequireSignIn>
            <PeoplePage admin />
          </RequireSignIn>
        }
      />
      <Route
        path="/admin/requests"
        element={
          <RequireSignIn>
            <AdminRequestsPage />
          </RequireSignIn>
        }
      />
      <Route
        path="/admin/emails"
        element={
          <RequireSignIn>
            <AdminEmailsPage />
          </RequireSignIn>
        }
      />
      <Route
        path="/admin/emails/:kind"
        element={
          <RequireSignIn>
            <AdminEmailPage />
          </RequireSignIn>
        }
      />
      <Route
        path="/admin/email-problems"
        element={
          <RequireSignIn>
            <AdminEmailProblemsPage />
          </RequireSignIn>
        }
      />
      <Route
        path="/admin/forwarded-receipts"
        element={
          <RequireSignIn>
            <AdminForwardedReceiptsPage />
          </RequireSignIn>
        }
      />
      <Route
        path="/admin/settings"
        element={
          <RequireSignIn>
            <AdminSettingsPage />
          </RequireSignIn>
        }
      />
      <Route path="/sign-in/*" element={<SignInPage />} />
      <Route path="/sign-up/*" element={<SignInPage mode="sign-up" />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}

/**
 * A limited preview: only admins start trips. Everyone else, signed in or not, gets the early access page, which needs
 * no sign-in and no Organizer Terms.
 */
function NewTrip() {
  const { isLoaded } = useUser()
  const isAdmin = useIsAdmin()
  if (!isLoaded) return null
  if (!isAdmin) return <LimitedPreviewPage />
  return (
    <RequireSignIn>
      <OrganizerTerms>
        <EditTripPage />
      </OrganizerTerms>
    </RequireSignIn>
  )
}
