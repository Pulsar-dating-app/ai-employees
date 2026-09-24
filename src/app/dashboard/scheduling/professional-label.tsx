"use client";

import { createContext, useContext } from "react";
import type { Appointment } from "./appointment-types";

// 2026-09-24 -- whether the agenda should say who each appointment is with.
// Only when the business has more than one active professional: a solo
// business's screens stay exactly as they were. Provided once by
// AppointmentsManager instead of threading a flag through every row.
const ShowProfessionalContext = createContext(false);

export function ShowProfessionalProvider({ value, children }: { value: boolean; children: React.ReactNode }) {
  return <ShowProfessionalContext.Provider value={value}>{children}</ShowProfessionalContext.Provider>;
}

export function professionalNameOf(appointment: Appointment): string | null {
  const embed = appointment.professionals as { name: string } | { name: string }[] | null | undefined;
  return (Array.isArray(embed) ? embed[0]?.name : embed?.name) ?? null;
}

export function useShowProfessional(): boolean {
  return useContext(ShowProfessionalContext);
}

export function useProfessionalName(appointment: Appointment): string | null {
  const show = useContext(ShowProfessionalContext);
  return show ? professionalNameOf(appointment) : null;
}
