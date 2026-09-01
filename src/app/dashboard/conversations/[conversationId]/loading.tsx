import { Skeleton } from "@/components/ui/skeleton";

export default function ConversationDetailLoading() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-4 w-40" />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <Skeleton className="h-[32rem] w-full rounded-xl lg:col-span-8" />
        <Skeleton className="h-64 w-full rounded-xl lg:col-span-4" />
      </div>
    </div>
  );
}
