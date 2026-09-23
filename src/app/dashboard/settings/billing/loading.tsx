import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center gap-4">
        <Skeleton className="h-11 w-11 rounded-lg" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-5 w-64" />
        </div>
      </div>
      <Skeleton className="h-64 w-full rounded-[28px]" />
      <div className="flex justify-center">
        <Skeleton className="h-12 w-80 rounded-full" />
      </div>
      <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
        <Skeleton className="h-96 rounded-[24px]" />
        <Skeleton className="h-96 rounded-[24px]" />
        <Skeleton className="h-96 rounded-[24px]" />
      </div>
    </div>
  );
}
