import { Skeleton } from "@/components/ui/skeleton";

export default function ConversationsLoading() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-7 w-44 sm:hidden" />
      <div className="overflow-hidden rounded-[28px] border border-outline-variant/60 bg-surface-container-lowest lg:grid lg:h-[calc(100dvh-9rem)] lg:min-h-[460px] lg:grid-cols-[minmax(320px,380px)_1fr]">
        <div className="flex flex-col gap-3 bg-surface-container-low/80 p-4 lg:border-r lg:border-outline-variant/60">
          <Skeleton className="h-10 w-full rounded-xl" />
          <Skeleton className="h-9 w-full rounded-xl" />
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-1 py-2">
              <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
              <div className="flex flex-1 flex-col gap-2">
                <Skeleton className="h-3 w-1/2" />
                <Skeleton className="h-3 w-4/5" />
              </div>
            </div>
          ))}
        </div>
        <div className="hidden bg-surface lg:block" />
      </div>
    </div>
  );
}
