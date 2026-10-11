import { Suspense } from "react";
import { Dashboard } from "@/features/dashboard/Dashboard";
import { listRaces } from "@/server/races/service";

async function DashboardWithRaces() {
  return <Dashboard races={await listRaces()} />;
}

export default function Page() {
  return (
    <Suspense fallback={<div className="shell" />}>
      <DashboardWithRaces />
    </Suspense>
  );
}
