import { AppRail } from "@/components/shell/AppRail";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-dvh overflow-hidden">
      <AppRail />
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
