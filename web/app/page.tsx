import { ReservationsDashboard } from "@/components/reservations-dashboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Reservations</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Upcoming Airbnb stays to register with Everline Resort. Add the guest name and
          mark each one as you hand it off.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">Upcoming stays</CardTitle>
        </CardHeader>
        <CardContent>
          <ReservationsDashboard />
        </CardContent>
      </Card>
    </main>
  );
}
