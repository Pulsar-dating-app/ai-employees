import { Skeleton } from "@/components/ui/skeleton";

export default function ProductsLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-10 w-72 rounded-full" />
        <Skeleton className="h-11 w-44 rounded-xl" />
      </div>
      <div className="flex flex-col gap-2 rounded-[24px] border border-outline-variant/60 bg-surface-container-lowest p-3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3">
            <Skeleton className="h-12 w-12 rounded-xl" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-4 w-56" />
              <Skeleton className="h-3 w-32" />
            </div>
            <Skeleton className="h-4 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}
