import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import AppLayout from '@/components/layout/AppLayout';
import ProtectedRoute from '@/components/routing/ProtectedRoute';

const HomePage = lazy(() => import('@/pages/HomePage'));
const GeneratePage = lazy(() => import('@/pages/GeneratePage'));
const StreamingPage = lazy(() => import('@/pages/StreamingPage'));
const PlanDetailPage = lazy(() => import('@/pages/PlanDetailPage'));
const LibraryPage = lazy(() => import('@/pages/LibraryPage'));
const ResourcesPage = lazy(() => import('@/pages/ResourcesPage'));
const LoginPage = lazy(() => import('@/pages/LoginPage'));
const CheckPage = lazy(() => import('@/pages/CheckPage'));

function PageFallback() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
    </div>
  );
}

export default function App() {
  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route element={<ProtectedRoute />}>
            <Route path="/generate" element={<GeneratePage />} />
            <Route path="/generate/:planId" element={<StreamingPage />} />
            <Route path="/plans/:id" element={<PlanDetailPage />} />
            <Route path="/library" element={<LibraryPage />} />
            <Route path="/resources" element={<ResourcesPage />} />
            <Route path="/check" element={<CheckPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
