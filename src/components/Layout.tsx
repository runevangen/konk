import { NavLink, Link, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../auth'
import Snow from './Snow'

export default function Layout() {
  const { session, profile } = useAuth()
  // Skjul navigasjon mens pinkoden vises (på /registrer) slik at den ikke forsvinner ved et uhell
  const showNav = session && useLocation().pathname !== '/registrer'
  return (
    <>
      <Snow />
      <header className="app-header">
        <div className="app-header-inner">
          <Link to="/" className="brand"><span aria-hidden="true">🎉</span>Konkurranser</Link>
          {showNav && (
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
