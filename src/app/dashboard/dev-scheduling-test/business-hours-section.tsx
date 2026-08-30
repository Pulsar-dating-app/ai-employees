"use client";

import { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// DEV-ONLY -- see page.tsx. day_of_week: 0 = Sunday .. 6 = Saturday, the
// convention I2 documented (business_hours' own migration never pinned it
// down).
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

type Row = { day_of_week: number; start_time: string; end_time: string; is_active: boolean };

export function BusinessHoursSection({ companyId }: { companyId: string }) {
  const [rows, setRows] = useState<Row[]>(
    DAYS.map((_, day_of_week) => ({ day_of_week, start_time: "09:00", end_time: "17:00", is_active: false })),
  );
  const [requiresApproval, setRequiresApproval] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const [hoursRes, companyRes] = await Promise.all([
        fetch(`/api/companies/${companyId}/business-hours`),
        fetch(`/api/companies/${companyId}`),
      ]);
      const hoursBody = await hoursRes.json().catch(() => null);
      const companyBody = await companyRes.json().catch(() => null);

      if (hoursBody?.businessHours?.length) {
        setRows((prev) =>
          prev.map((row) => {
            const existing = hoursBody.businessHours.find((h: Row) => h.day_of_week === row.day_of_week);
            return existing
              ? { ...row, start_time: existing.start_time.slice(0, 5), end_time: existing.end_time.slice(0, 5), is_active: true }
              : { ...row, is_active: false };
          }),
        );
      }
      if (companyBody?.company) {
        setRequiresApproval(Boolean(companyBody.company.requires_appointment_approval));
      }
    })();
  }, [companyId]);

  async function save() {
    setIsSaving(true);
    setError(null);
    const businessHours = rows
      .filter((r) => r.is_active)
      .map((r) => ({ day_of_week: r.day_of_week, start_time: r.start_time, end_time: r.end_time }));

    const res = await fetch(`/api/companies/${companyId}/business-hours`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ businessHours }),
    });
    setIsSaving(false);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error ?? "Failed to save business hours");
    }
  }

  async function saveApproval(value: boolean) {
    setRequiresApproval(value);
    await fetch(`/api/companies/${companyId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requires_appointment_approval: value }),
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>2. Business hours (H2) + approval setting (H3)</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-1">
          {rows.map((row, i) => (
            <div key={row.day_of_week} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={row.is_active}
                onChange={(e) =>
                  setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, is_active: e.target.checked } : r)))
                }
              />
              <span className="w-24 text-sm text-on-surface">{DAYS[row.day_of_week]}</span>
              <Input
                className="w-28"
                value={row.start_time}
                onChange={(e) =>
                  setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, start_time: e.target.value } : r)))
                }
              />
              <span className="text-sm text-on-surface-variant">to</span>
              <Input
                className="w-28"
                value={row.end_time}
                onChange={(e) =>
                  setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, end_time: e.target.value } : r)))
                }
              />
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2 border-t border-outline-variant pt-3">
          <Button size="sm" onClick={save} isLoading={isSaving}>
            Save business hours
          </Button>
          {error ? <p className="text-sm text-error">{error}</p> : null}
        </div>

        <label className="flex items-center gap-2 text-sm text-on-surface">
          <input
            type="checkbox"
            checked={requiresApproval}
            onChange={(e) => saveApproval(e.target.checked)}
          />
          Require manual approval for new appointments (companies.requires_appointment_approval)
        </label>
      </CardContent>
    </Card>
  );
}
