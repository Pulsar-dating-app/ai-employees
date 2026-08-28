import { Skeleton } from "@/components/ui/skeleton";

export default function MetricsLoading() {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-80" />
      </div>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-6">
        <Skeleton className="h-44 md:col-span-1 lg:col-span-3" />
        <Skeleton className="h-44 md:col-span-1 lg:col-span-3" />
        <Skeleton className="h-36 md:col-span-1 lg:col-span-2" />
        <Skeleton className="h-36 md:col-span-1 lg:col-span-2" />
        <Skeleton className="h-36 md:col-span-1 lg:col-span-2" />
      </div>
      <Skeleton className="h-40 w-full" />
    </div>
  );
}
