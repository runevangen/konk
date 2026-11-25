import type React from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useAuth } from './auth'
import Layout from './components/Layout'
import { Loading } from './components/ui'
import Home from './pages/Home'
import Login from './pages/Login'
import Register from './pages/Register'
import Competition from './pages/Competition'
import Results from './pages/Results'
import Tavle from './pages/Tavle'
import ProfilePage from './pages/Profile'
import Admin from './pages/Admin'

function RequireAuth({ children, admin = false }: { children: React.ReactElement; admin?: boolean }) {
  const { loading, session, profile } = useAuth()
  const loc = useLocation()
  if (loading) return <Loading />
  if (!session) return <Navigate to="/login" replace state={{ from: loc.pathname }} />
  if (admin && !profile?.is_admin) return <Navigate to="/" replace />
  return children
}

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/login" element={<Login />} />
        <Route path="/registrer" element={<Register />} />
        <Route path="/" element={<RequireAuth><Home /></RequireAuth>} />
        <Route path="/k/:slug" element={<RequireAuth><Competition /></RequireAuth>} />
        <Route path="/k/:slug/tavle" element={<RequireAuth><Tavle /></RequireAuth>} />
        <Route path="/k/:slug/resultat" element={<RequireAuth><Results /></RequireAuth>} />
        <Route path="/profil" element={<RequireAuth><ProfilePage /></RequireAuth>} />
        <Route path="/admin" element={<RequireAuth admin><Admin /></RequireAuth>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
