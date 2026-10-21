import { Route, Routes } from 'react-router-dom'
import { ContactPage } from './pages/ContactPage'
import { EditTripPage } from './pages/EditTripPage'
import { FaqPage } from './pages/FaqPage'
import { GuestTripPage } from './pages/GuestTripPage'
import { HomePage } from './pages/HomePage'
import { NotFoundPage } from './pages/NotFoundPage'
import { PrivacyPage } from './pages/PrivacyPage'
import { TripsPage } from './pages/TripsPage'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/organize" element={<TripsPage />} />
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route path="/faq" element={<FaqPage />} />
      <Route path="/contact" element={<ContactPage />} />
      <Route path="/t/:slug" element={<GuestTripPage />} />
      <Route path="/organize/new" element={<EditTripPage />} />
      <Route path="/organize/:id" element={<EditTripPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}
