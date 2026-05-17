import { Outlet } from 'react-router-dom';
import Navbar from '@/components/layout/Navbar';
import { Toaster } from '@/components/ui/Toaster';

export default function AppLayout() {
  return (
    <>
      <Navbar />
      <main className="flex-1">
        <Outlet />
      </main>
      <Toaster />
    </>
  );
}
