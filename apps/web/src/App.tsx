import { Route, Routes } from 'react-router-dom'
import { EditTripPage } from './pages/EditTripPage'
import { GuestTripPage } from './pages/GuestTripPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { TripsPage } from './pages/TripsPage'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<TripsPage />} />
      <Route path="/t/:slug" element={<GuestTripPage />} />
      <Route path="/organize/new" element={<EditTripPage />} />
      <Route path="/organize/:id" element={<EditTripPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}
