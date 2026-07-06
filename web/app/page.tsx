import Image from "next/image";
import { ReservationsDashboard } from "@/components/reservations-dashboard";

function MountainMark() {
  return (
    <svg width="30" height="30" viewBox="0 0 32 32" fill="none" aria-hidden>
      <circle cx="23.5" cy="8.5" r="3.8" fill="var(--brand)" />
      <path d="M1.5 28 L11.5 11 L18.5 23 L21.5 18.5 L30.5 28 Z" fill="var(--primary)" />
    </svg>
  );
}

export default function Home() {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="bg-card/70 border-b backdrop-blur-sm">
        <div className="mx-auto flex w-full max-w-5xl items-center gap-2.5 px-6 py-4">
          <MountainMark />
          <span className="text-lg font-semibold tracking-tight">
            Everline<span className="text-brand"> Ops</span>
          </span>
          <span className="text-muted-foreground ml-auto text-sm">
            Property coordination
          </span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">
        {/* Hero */}
        <div className="relative mb-8 h-[240px] overflow-hidden rounded-2xl shadow-sm">
          <Image
            src="/everline-hero.png"
            alt="Everline Resort, Olympic Valley"
            fill
            priority
            sizes="(max-width: 1024px) 100vw, 960px"
            className="object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-transparent" />
          <div className="absolute bottom-0 left-0 p-6 text-white">
            <p className="text-xs font-medium tracking-widest text-white/80 uppercase">
              Everline Resort · Olympic Valley
            </p>
            <h1 className="mt-1.5 text-3xl font-semibold tracking-tight">
              Upcoming reservations
            </h1>
            <p className="mt-1.5 max-w-xl text-sm text-white/85">
              Airbnb stays to register for key access. Add each guest&apos;s name, then
              send it to the resort.
            </p>
          </div>
        </div>

        <ReservationsDashboard />
      </main>
    </div>
  );
}
