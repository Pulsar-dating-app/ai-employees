import { Skeleton } from "@/components/ui/skeleton";

export default function MetricsLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <Skeleton className="h-10 w-72 rounded-full" />
        <Skeleton className="ml-auto h-9 w-40 rounded-full" />
      </div>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,1fr)]">
        <Skeleton className="h-96 w-full rounded-[24px]" />
        <Skeleton className="h-96 w-full rounded-[24px]" />
      </div>
      <Skeleton className="h-40 w-full rounded-[24px]" />
    </div>
  );
}
