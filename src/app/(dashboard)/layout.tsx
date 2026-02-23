import { NavBar } from '@/components/nav-bar';
import { Toaster } from '@/components/ui/sonner';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen">
      <NavBar />
      <main className="flex-1 p-4 md:p-8 pb-20 md:pb-8">{children}</main>
      <Toaster />
    </div>
  );
}
