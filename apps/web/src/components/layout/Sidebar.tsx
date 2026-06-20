import { NavLink } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { NAV_ITEMS } from '@/constants/navigation'

export function Sidebar() {
  const user = useAuthStore((state) => state.user)
  const logout = useAuthStore((state) => state.logout)

  const visibleItems = NAV_ITEMS.filter(
    (item) => !item.roles || (user && item.roles.includes(user.role))
  )

  return (
    <aside className="w-56 bg-gray-900 min-h-screen flex flex-col hidden md:flex">
      <div className="p-4 border-b border-gray-700">
        <h1 className="text-white font-bold text-lg">Order Hub</h1>
        {user && <p className="text-gray-400 text-xs mt-1">{user.name} · {user.role}</p>}
      </div>

      <nav className="flex-1 p-3 space-y-1">
        {visibleItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              `block px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                isActive ? 'bg-brand-600 text-white' : 'text-gray-300 hover:bg-gray-800 hover:text-white'
              }`
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="p-3 border-t border-gray-700">
        <button
          onClick={() => void logout()}
          className="w-full px-3 py-2 text-left text-sm text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
        >
          Sair
        </button>
      </div>
    </aside>
  )
}
