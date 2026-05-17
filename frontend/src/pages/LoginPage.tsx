'use client';

import { Suspense, useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useRouter, useSearchParams } from '@/lib/navigation';
import { errorMessage } from '@/lib/api';
import { supabase } from '@/lib/supabase';

function safeNextUrl(raw: string | null): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return '/library';
  return raw;
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = safeNextUrl(searchParams.get('next'));
  const [isLogin, setIsLogin] = useState(true);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) router.replace(redirectTo);
    });
  }, [router, redirectTo]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (isLogin) {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        const token = data.session?.access_token || '';
        if (token) localStorage.setItem('auth_token', token);
        router.push(redirectTo);
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName } },
        });
        if (error) throw error;
        if (data.session?.access_token) {
          // Email confirm disabled — login ngay
          localStorage.setItem('auth_token', data.session.access_token);
          router.push(redirectTo);
        } else {
          // Email confirm enabled — báo user kiểm tra email
          setError('');
          setIsLogin(true);
          alert('Tài khoản đã tạo! Kiểm tra email để xác nhận trước khi đăng nhập.');
        }
      }
    } catch (err: unknown) {
      setError(errorMessage(err, 'Đã xảy ra lỗi'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center px-6">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-xl shadow-lg">
              GA
            </div>
            <span className="text-white font-bold text-2xl">Giáo Án Thông Minh</span>
          </Link>
        </div>

        {/* Card */}
        <div className="glass rounded-2xl p-8 border border-white/10 animate-fade-in">
          <h1 className="text-2xl font-bold text-white mb-2 text-center">
            {isLogin ? 'Đăng nhập' : 'Tạo tài khoản'}
          </h1>
          <p className="text-gray-400 text-center mb-6">
            {isLogin ? 'Chào mừng bạn quay lại' : 'Bắt đầu soạn giáo án thông minh'}
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Họ và tên</label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="input-field !bg-white/5 !border-white/10 !text-white placeholder-gray-500"
                  placeholder="Nguyễn Văn A"
                  required={!isLogin}
                  id="input-fullname"
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input-field !bg-white/5 !border-white/10 !text-white placeholder-gray-500"
                placeholder="teacher@example.com"
                required
                id="input-email"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Mật khẩu</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-field !bg-white/5 !border-white/10 !text-white placeholder-gray-500"
                placeholder="••••••••"
                required
                minLength={6}
                id="input-password"
              />
            </div>

            {error && (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full !py-3.5 disabled:opacity-50 disabled:cursor-not-allowed"
              id="btn-submit"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                      fill="none"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  Đang xử lý...
                </span>
              ) : isLogin ? (
                'Đăng nhập'
              ) : (
                'Tạo tài khoản'
              )}
            </button>
          </form>

          <div className="mt-6 text-center">
            <button
              onClick={() => {
                setIsLogin(!isLogin);
                setError('');
              }}
              className="text-blue-400 hover:text-blue-300 text-sm font-medium transition-colors"
              id="btn-toggle-auth"
            >
              {isLogin ? 'Chưa có tài khoản? Đăng ký' : 'Đã có tài khoản? Đăng nhập'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
