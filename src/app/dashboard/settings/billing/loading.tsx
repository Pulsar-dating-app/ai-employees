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
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
        <div className="flex flex-col gap-6 lg:col-span-8">
          <Skeleton className="h-40 rounded-xl" />
          <Skeleton className="h-32 rounded-xl" />
        </div>
        <div className="lg:col-span-4">
          <Skeleton className="h-56 rounded-xl" />
        </div>
      </div>
    </div>
  );
}
