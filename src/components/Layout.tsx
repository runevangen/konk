import { NavLink, Link, Outlet } from 'react-router-dom'
import { useAuth } from '../auth'
import Snow from './Snow'

export default function Layout() {
  const { session, profile } = useAuth()
  return (
    <>
      <Snow />
      <header className="app-header">
        <div className="app-header-inner">
          <Link to="/" className="brand"><span aria-hidden="true">🎄</span>Konk<span className="dot" aria-hidden="true">.</span></Link>
          {session && (
            <nav className="nav" aria-label="Hovedmeny">
              <NavLink to="/" end>Hjem</NavLink>
              <NavLink to="/profil">Profil</NavLink>
              {profile?.is_admin && <NavLink to="/admin">Admin</NavLink>}
            </nav>
          )}
        </div>
      </header>
      <main className="container"><Outlet /></main>
    </>
  )
}
