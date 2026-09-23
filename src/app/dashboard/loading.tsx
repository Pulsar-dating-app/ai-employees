import { Skeleton } from "@/components/ui/skeleton";

export default function MyTeamLoading() {
  return (
    <div className="flex flex-col gap-8">
      <Skeleton className="h-8 w-40" />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {[0, 1].map((i) => (
          <Skeleton key={i} className="h-60 w-full rounded-[28px]" />
        ))}
      </div>
    </div>
  );
}
