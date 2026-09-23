import { Skeleton } from "@/components/ui/skeleton";

export default function ServicesLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-10 w-72 rounded-full" />
        <Skeleton className="h-11 w-44 rounded-xl" />
      </div>
      <Skeleton className="h-80 w-full rounded-[24px]" />
      <Skeleton className="h-24 w-full rounded-[24px]" />
    </div>
  );
}
