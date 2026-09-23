import { Skeleton } from "@/components/ui/skeleton";

export default function SettingsLoading() {
  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[232px_minmax(0,1fr)]">
      <div className="hidden flex-col gap-3 lg:flex">
        <Skeleton className="h-10 w-full rounded-xl" />
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-9 w-full rounded-xl" />
        ))}
      </div>
      <div className="flex max-w-4xl flex-col gap-6">
        <Skeleton className="h-96 w-full rounded-[24px]" />
        <Skeleton className="h-64 w-full rounded-[24px]" />
      </div>
    </div>
  );
}
