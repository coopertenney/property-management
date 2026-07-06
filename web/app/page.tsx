import { ReservationsDashboard } from "@/components/reservations-dashboard";

function MountainMark() {
  return (
    <svg width="30" height="30" viewBox="0 0 32 32" fill="none" aria-hidden>
      <circle cx="23.5" cy="8.5" r="3.8" fill="var(--brand)" />
      <path
        d="M1.5 28 L11.5 11 L18.5 23 L21.5 18.5 L30.5 28 Z"
        fill="var(--primary)"
      />
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

      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">Upcoming reservations</h1>
          <p className="text-muted-foreground mt-1.5 max-w-2xl text-sm leading-relaxed">
            Airbnb stays to register with Everline Resort for key access. Add each guest&apos;s
            name and move it along the handoff as you go.
          </p>
        </div>
        <ReservationsDashboard />
      </main>
    </div>
  );
}
