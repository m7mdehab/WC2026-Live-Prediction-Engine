import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { MobileNav } from "@/components/layout/MobileNav";

export function AppFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col overflow-x-clip bg-bg">
      <Header />
      {/* the Footer below clears the fixed mobile nav, so main only needs its own breathing room */}
      <main className="mx-auto w-full max-w-[1280px] flex-1 px-4 pt-6 pb-10 md:px-6">
        {children}
      </main>
      <Footer />
      <MobileNav />
    </div>
  );
}
