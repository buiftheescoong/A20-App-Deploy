'use client';

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { usePathname, useRouter } from '@/lib/navigation';
import { cn } from '@/lib/utils';
import {
  BookOpen, Library, FolderOpen, PenTool,
  Menu, X, LogOut, User,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { User as SupabaseUser } from '@supabase/supabase-js';

const NAV_ITEMS = [
  { href: '/generate', label: 'Soạn giáo án', icon: PenTool },
  { href: '/library', label: 'Thư viện', icon: Library },
  { href: '/resources', label: 'Tài nguyên', icon: FolderOpen },
];

function getLoginPath(next: string) {
  return `/login?next=${encodeURIComponent(next)}`;
}

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);

  useEffect(() => {
    let mounted = true;

    const setAuthState = (nextUser: SupabaseUser | null) => {
      if (!mounted) return;
      setUser(nextUser);
      setIsAuthReady(true);
    };

    supabase.auth
      .getSession()
      .then(({ data: { session } }) => setAuthState(session?.user ?? null))
      .catch(() => setAuthState(null));

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthState(session?.user ?? null);
    });
    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    localStorage.removeItem('auth_token');
    router.push('/login');
  };

  const getNavHref = (href: string) => (isAuthReady && !user ? getLoginPath(href) : href);

  return (
    <header className="sticky top-0 z-50 glass border-b border-white/10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2 group">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center shadow-lg shadow-blue-500/30 group-hover:shadow-blue-500/50 transition-shadow">
              <BookOpen className="w-5 h-5 text-white" />
            </div>
            <span className="text-lg font-bold gradient-text hidden sm:block">
              Giáo Án AI
            </span>
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-1">
            {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
              const isActive = pathname.startsWith(href);
              const navHref = getNavHref(href);
              return (
                <Link
                  key={href}
                  to={navHref}
                  className={cn(
                    'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200',
                    isActive
                      ? 'bg-blue-600/10 text-blue-600 shadow-sm'
                      : 'text-gray-600 hover:text-blue-600 hover:bg-blue-50/50',
                  )}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </Link>
              );
            })}
          </nav>

          {/* User Menu */}
          <div className="flex items-center gap-3">
            {user ? (
              <div className="hidden md:flex items-center gap-2">
                <span className="text-sm text-gray-500 max-w-[140px] truncate">{user.email}</span>
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm text-red-500 hover:bg-red-50 transition-all"
                  title="Đăng xuất"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <Link
                to="/login"
                className="hidden md:flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-all"
              >
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center">
                  <User className="w-4 h-4 text-white" />
                </div>
                <span>Đăng nhập</span>
              </Link>
            )}

            {/* Mobile Toggle */}
            <button
              className="md:hidden p-2 rounded-xl text-gray-600 hover:bg-gray-100 transition-colors"
              onClick={() => setMobileOpen(!mobileOpen)}
              aria-label="Toggle menu"
            >
              {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      {mobileOpen && (
        <div className="md:hidden border-t border-gray-100 bg-white/95 backdrop-blur-xl animate-slide-up">
          <nav className="p-4 space-y-1">
            {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
              const isActive = pathname.startsWith(href);
              const navHref = getNavHref(href);
              return (
                <Link
                  key={href}
                  to={navHref}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    'flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all',
                    isActive
                      ? 'bg-blue-600/10 text-blue-600'
                      : 'text-gray-600 hover:bg-gray-50',
                  )}
                >
                  <Icon className="w-5 h-5" />
                  {label}
                </Link>
              );
            })}
            <div className="border-t border-gray-100 pt-2 mt-2">
              {user ? (
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm text-red-500 hover:bg-red-50 w-full transition-all"
                >
                  <LogOut className="w-5 h-5" />
                  Đăng xuất
                </button>
              ) : (
                <Link
                  to="/login"
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm text-gray-600 hover:bg-gray-50 w-full transition-all"
                >
                  <User className="w-5 h-5" />
                  Đăng nhập
                </Link>
              )}
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
