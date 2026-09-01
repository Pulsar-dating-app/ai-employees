import { Skeleton } from "@/components/ui/skeleton";

export default function SchedulingSettingsLoading() {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-96" />
      </div>
      <div className="flex max-w-3xl flex-col gap-8">
        <Skeleton className="h-[28rem] w-full" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-56 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    </div>
  );
}
