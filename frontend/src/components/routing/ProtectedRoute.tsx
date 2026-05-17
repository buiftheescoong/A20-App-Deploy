import { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';

export default function ProtectedRoute() {
  const location = useLocation();
  const [isChecking, setIsChecking] = useState(true);
  const [isAuthed, setIsAuthed] = useState(false);
  const loginPath = `/login?next=${encodeURIComponent(location.pathname + location.search)}`;

  useEffect(() => {
    let mounted = true;

    const setAuthState = (isSignedIn: boolean) => {
      if (!mounted) return;
      setIsAuthed(isSignedIn);
      setIsChecking(false);
    };

    supabase.auth
      .getSession()
      .then(({ data: { session } }) => setAuthState(Boolean(session?.user)))
      .catch(() => setAuthState(false));

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthState(Boolean(session?.user));
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  if (isChecking) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!isAuthed) {
    return <Navigate to={loginPath} replace />;
  }

  return <Outlet />;
}
