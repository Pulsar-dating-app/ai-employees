import { SchedulingTabs } from "./scheduling-tabs";

// Shared chrome for the Scheduling area (Trello K5). Each child page still
// renders its own PageHeader — the sub-tabs sit above it, so switching
// screens keeps the same navigation anchored in place.
export default function SchedulingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-8">
      <SchedulingTabs />
      {children}
    </div>
  );
}
