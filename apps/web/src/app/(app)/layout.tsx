import { Sidebar } from "@/components/shell/Sidebar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-dvh overflow-hidden bg-canvas">
      <Sidebar />
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
