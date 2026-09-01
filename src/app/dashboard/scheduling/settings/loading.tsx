import { Skeleton } from "@/components/ui/skeleton";

export default function SchedulingSettingsLoading() {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-96" />
      </div>
      {/* The sections render collapsed (K8) — a stack of compact rows. */}
      <div className="flex max-w-3xl flex-col gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-[5.5rem] w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}
