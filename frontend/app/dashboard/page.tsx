"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Cronometro } from "@/components/dashboard/cronometro";
import { LiveTiming } from "@/components/dashboard/live-timing";
import { ScheduleTable } from "@/components/dashboard/schedule-table";
import { Summary } from "@/components/dashboard/summary";
import { useLiveStream, useRaceState } from "@/hooks/useRaceState";

export default function DashboardPage() {
  const router = useRouter();
  const { data, isLoading } = useRaceState();
  useLiveStream();

  useEffect(() => {
    if (!isLoading && !data?.config) {
      router.replace("/");
    }
  }, [isLoading, data, router]);

  if (isLoading || !data?.config) {
    return (
      <main className="mx-auto flex w-full max-w-5xl flex-1 items-center justify-center p-6">
        <p className="text-muted-foreground">A carregar...</p>
      </main>
    );
  }

  const currentStint = data.plan[data.timer.currentStintIndex];

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Race Companion</h1>
          <p className="text-muted-foreground text-sm">
            Kart {data.config.teamId} — {data.config.drivers.length} pilotos
          </p>
        </div>
        <Link href="/" className="text-muted-foreground text-sm underline">
          Reconfigurar
        </Link>
      </div>

      <Cronometro state={data} currentStint={currentStint} />
      <ScheduleTable state={data} />
      <LiveTiming state={data} />
      <Summary state={data} />
    </main>
  );
}
