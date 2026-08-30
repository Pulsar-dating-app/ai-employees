"use client";

import { useCallback, useEffect, useState } from "react";
import { ServicesSection, type Service } from "./services-section";
import { BusinessHoursSection } from "./business-hours-section";
import { CalendarSection } from "./calendar-section";
import { AvailabilitySection } from "./availability-section";
import { AppointmentsSection } from "./appointments-section";

// DEV-ONLY -- see page.tsx. Owns the one piece of state shared across
// sections (the services list, since Availability/Appointments both need it
// for their own dropdowns) and nothing else; every section otherwise owns
// its own fetch calls and local state independently.
export function SchedulingTestPanel({
  companyId,
  googleClientId,
}: {
  companyId: string;
  googleClientId: string | null;
}) {
  const [services, setServices] = useState<Service[]>([]);

  const refreshServices = useCallback(async () => {
    const res = await fetch(`/api/companies/${companyId}/services`);
    const body = await res.json().catch(() => null);
    setServices(body?.services ?? []);
  }, [companyId]);

  useEffect(() => {
    fetch(`/api/companies/${companyId}/services`)
      .then((res) => res.json())
      .then((body: { services?: Service[] }) => setServices(body?.services ?? []))
      .catch(() => setServices([]));
  }, [companyId]);

  return (
    <div className="flex flex-col gap-6">
      <ServicesSection companyId={companyId} services={services} onChanged={refreshServices} />
      <BusinessHoursSection companyId={companyId} />
      <CalendarSection companyId={companyId} googleClientId={googleClientId} />
      <AvailabilitySection companyId={companyId} services={services} />
      <AppointmentsSection companyId={companyId} services={services} />
    </div>
  );
}
