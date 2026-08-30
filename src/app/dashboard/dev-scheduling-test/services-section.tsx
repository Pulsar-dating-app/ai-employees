"use client";

import { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// DEV-ONLY -- see page.tsx.

export type Service = {
  id: string;
  name: string;
  duration_minutes: number;
  buffer_minutes: number;
  is_active: boolean;
};

export function ServicesSection({
  companyId,
  services,
  onChanged,
}: {
  companyId: string;
  services: Service[];
  onChanged: () => void;
}) {
  const [name, setName] = useState("Consultation");
  const [duration, setDuration] = useState("30");
  const [buffer, setBuffer] = useState("0");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createService() {
    setIsSaving(true);
    setError(null);
    const res = await fetch(`/api/companies/${companyId}/services`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        duration_minutes: Number(duration),
        buffer_minutes: Number(buffer),
      }),
    });
    setIsSaving(false);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error ?? "Failed to create service");
      return;
    }
    onChanged();
  }

  async function toggleActive(service: Service) {
    if (service.is_active) {
      await fetch(`/api/companies/${companyId}/services/${service.id}`, { method: "DELETE" });
    } else {
      await fetch(`/api/companies/${companyId}/services/${service.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: true }),
      });
    }
    onChanged();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>1. Services (H1)</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-2">
          {services.length === 0 ? (
            <p className="text-sm text-on-surface-variant">No services yet.</p>
          ) : (
            services.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-2 rounded-md border border-outline-variant px-3 py-2">
                <span className="text-sm text-on-surface">
                  {s.name} — {s.duration_minutes}min + {s.buffer_minutes}min buffer{" "}
                  {s.is_active ? "" : "(inactive)"}
                </span>
                <Button size="sm" variant="secondary" onClick={() => toggleActive(s)}>
                  {s.is_active ? "Deactivate" : "Reactivate"}
                </Button>
              </div>
            ))
          )}
        </div>

        <div className="flex flex-wrap items-end gap-2 border-t border-outline-variant pt-3">
          <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <Input label="Duration (min)" value={duration} onChange={(e) => setDuration(e.target.value)} />
          <Input label="Buffer (min)" value={buffer} onChange={(e) => setBuffer(e.target.value)} />
          <Button size="sm" onClick={createService} isLoading={isSaving}>
            Add service
          </Button>
        </div>
        {error ? <p className="text-sm text-error">{error}</p> : null}
      </CardContent>
    </Card>
  );
}
