import { Route, Routes } from 'react-router-dom'
import { AuthProvider } from './auth/AuthContext'
import Footer from './components/layout/Footer'
import Header from './components/layout/Header'
import ProtectedRoute from './components/ProtectedRoute'
import AdminDashboard from './pages/dashboards/AdminDashboard'
import BorrowerDashboard from './pages/dashboards/BorrowerDashboard'
import LenderDashboard from './pages/dashboards/LenderDashboard'
import RepayPage from './pages/dashboards/RepayPage'
import ShgDashboard from './pages/dashboards/ShgDashboard'
import HomeView from './pages/HomeView'
import LoginPage from './pages/login/LoginPage'
import { TourProvider } from './tour/TourContext'

export default function App() {
  return (
    <AuthProvider>
      <TourProvider>
      <Header />
      <main id="main-content">
        <Routes>
          <Route path="/" element={<HomeView />} />

          <Route path="/login/borrower" element={<LoginPage role="borrower" />} />
          <Route path="/login/lender" element={<LoginPage role="lender" />} />
          <Route path="/login/shg" element={<LoginPage role="shg" />} />
          <Route path="/login/admin" element={<LoginPage role="admin" />} />

          <Route
            path="/borrower"
            element={
              <ProtectedRoute role="borrower">
                <BorrowerDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/borrower/repay"
            element={
              <ProtectedRoute role="borrower">
                <RepayPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/lender"
            element={
              <ProtectedRoute role="lender">
                <LenderDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/shg"
            element={
              <ProtectedRoute role="shg">
                <ShgDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin"
            element={
              <ProtectedRoute role="admin">
                <AdminDashboard />
              </ProtectedRoute>
            }
          />
        </Routes>
      </main>
      <Footer />
      </TourProvider>
    </AuthProvider>
  )
}
