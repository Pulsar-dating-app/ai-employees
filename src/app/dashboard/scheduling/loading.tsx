import { Skeleton } from "@/components/ui/skeleton";

export default function AppointmentsLoading() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-64 w-full rounded-[28px]" />
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-10 w-80 rounded-full" />
      </div>
      <Skeleton className="h-72 w-full rounded-[24px]" />
    </div>
  );
}
