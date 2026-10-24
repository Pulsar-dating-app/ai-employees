"use client";

import { createContext, useContext } from "react";
import type { SetupStep } from "@/lib/setup/checklist";

// The layout already loads the getting-started steps for the sidebar entry.
// Pages read the same list from here instead of querying it again.
const SetupStepsContext = createContext<SetupStep[]>([]);

export function SetupStepsProvider({ steps, children }: { steps: SetupStep[]; children: React.ReactNode }) {
  return <SetupStepsContext.Provider value={steps}>{children}</SetupStepsContext.Provider>;
}

export function useSetupSteps(): SetupStep[] {
  return useContext(SetupStepsContext);
}
