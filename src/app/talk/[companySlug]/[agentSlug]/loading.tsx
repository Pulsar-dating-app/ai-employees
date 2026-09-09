import { Skeleton } from "@/components/ui/skeleton";

export default function TalkLoading() {
  return (
    <div className="flex h-screen flex-col bg-surface">
      <div className="flex items-center gap-3 border-b border-outline-variant bg-surface-container-lowest px-4 py-3 shadow-level1 md:px-8">
        <Skeleton className="h-11 w-11 shrink-0 rounded-full" />
        <div className="flex flex-col gap-1.5">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-3 w-16" />
        </div>
      </div>
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-5 px-4 py-6 md:px-6">
        <Skeleton className="mx-auto h-4 w-16" />
        <div className="flex items-end gap-2.5">
          <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
          <Skeleton className="h-16 w-3/4 max-w-md rounded-2xl rounded-bl-sm" />
        </div>
        <Skeleton className="ml-auto h-12 w-1/2 max-w-xs rounded-2xl rounded-br-sm" />
        <div className="flex items-end gap-2.5">
          <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
          <Skeleton className="h-20 w-2/3 max-w-sm rounded-2xl rounded-bl-sm" />
        </div>
      </div>
    </div>
  );
}
