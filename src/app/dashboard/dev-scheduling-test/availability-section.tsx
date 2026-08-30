"use client";

import { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { Service } from "./services-section";

// DEV-ONLY -- see page.tsx.

type Slot = { start: string; end: string };

export function AvailabilitySection({ companyId, services }: { companyId: string; services: Service[] }) {
  const [serviceId, setServiceId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [googleCalendarChecked, setGoogleCalendarChecked] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function check() {
    if (!serviceId || !from || !to) {
      setError("Pick a service and both dates first.");
      return;
    }
    setIsLoading(true);
    setError(null);
    const res = await fetch(
      `/api/companies/${companyId}/services/${serviceId}/availability?from=${from}&to=${to}`,
    );
    setIsLoading(false);
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      setError(body?.error ?? "Failed to load availability");
      setSlots(null);
      return;
    }
    setSlots(body.slots);
    setGoogleCalendarChecked(body.googleCalendarChecked);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>4. Availability engine (I2)</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-end gap-2">
          <Select
            label="Service"
            value={serviceId}
            onChange={(e) => setServiceId(e.target.value)}
            options={[{ value: "", label: "Select a service" }, ...services.map((s) => ({ value: s.id, label: s.name }))]}
          />
          <Input label="From (YYYY-MM-DD)" value={from} onChange={(e) => setFrom(e.target.value)} />
          <Input label="To (YYYY-MM-DD)" value={to} onChange={(e) => setTo(e.target.value)} />
          <Button size="sm" onClick={check} isLoading={isLoading}>
            Check availability
          </Button>
        </div>

        {error ? <p className="text-sm text-error">{error}</p> : null}

        {slots ? (
          <div className="flex flex-col gap-1">
            <p className="text-sm text-on-surface-variant">
              googleCalendarChecked: {String(googleCalendarChecked)} — {slots.length} slot(s)
            </p>
            {slots.map((slot) => (
              <p key={slot.start} className="text-sm text-on-surface">
                {slot.start} → {slot.end}
              </p>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
