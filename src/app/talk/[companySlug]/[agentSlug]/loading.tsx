import { Skeleton } from "@/components/ui/skeleton";

export default function TalkLoading() {
  return (
    <div className="flex h-screen flex-col bg-surface">
      <div className="flex items-center gap-4 border-b border-outline-variant px-4 py-3 md:px-10">
        <Skeleton className="h-12 w-12 shrink-0 rounded-full" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-3 w-16" />
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-4 px-4 py-8 md:px-10">
        <Skeleton className="h-16 w-3/4 max-w-md" />
        <Skeleton className="ml-auto h-12 w-1/2 max-w-xs" />
        <Skeleton className="h-16 w-2/3 max-w-sm" />
      </div>
    </div>
  );
}
