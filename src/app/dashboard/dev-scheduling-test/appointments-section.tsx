"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { Service } from "./services-section";

// DEV-ONLY -- see page.tsx. No customers CRUD API exists yet (out of scope
// for H1-H3) -- "Add customer" inserts directly via the browser's own
// RLS-scoped Supabase client, same escape hatch
// tests/integration/appointments.test.ts's createCustomer helper uses.

type Customer = { id: string; name: string };
type Appointment = {
  id: string;
  service_id: string | null;
  customer_id: string;
  status: string;
  starts_at: string;
  ends_at: string;
  google_event_id: string | null;
};

export function AppointmentsSection({ companyId, services }: { companyId: string; services: Service[] }) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerName, setCustomerName] = useState("Jane Doe");
  const [customerId, setCustomerId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function refreshAppointments() {
    const res = await fetch(`/api/companies/${companyId}/appointments`);
    const body = await res.json().catch(() => null);
    setAppointments(body?.appointments ?? []);
  }

  useEffect(() => {
    fetch(`/api/companies/${companyId}/appointments`)
      .then((res) => res.json())
      .then((body: { appointments?: Appointment[] }) => setAppointments(body?.appointments ?? []))
      .catch(() => setAppointments([]));
  }, [companyId]);

  async function addCustomer() {
    const supabase = createClient();
    const { data, error: insertError } = await supabase
      .from("customers")
      .insert({ company_id: companyId, name: customerName, phone: "+15550000000", channel: "whatsapp" })
      .select("id, name")
      .single();
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setCustomers((prev) => [...prev, data as Customer]);
    setCustomerId((data as Customer).id);
  }

  async function createAppointment() {
    if (!serviceId || !customerId || !startsAt) {
      setError("Pick a service, a customer, and a start time first.");
      return;
    }
    setError(null);
    const res = await fetch(`/api/companies/${companyId}/appointments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        service_id: serviceId,
        customer_id: customerId,
        starts_at: new Date(startsAt).toISOString(),
      }),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      setError(body?.error ?? "Failed to create appointment");
      return;
    }
    refreshAppointments();
  }

  async function cancel(id: string) {
    await fetch(`/api/companies/${companyId}/appointments/${id}`, { method: "DELETE" });
    refreshAppointments();
  }

  async function confirm(id: string) {
    await fetch(`/api/companies/${companyId}/appointments/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "confirmed" }),
    });
    refreshAppointments();
  }

  async function reschedule(id: string) {
    const newStart = window.prompt("New start time (e.g. 2027-03-02T10:00)");
    if (!newStart) return;
    await fetch(`/api/companies/${companyId}/appointments/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ starts_at: new Date(newStart).toISOString() }),
    });
    refreshAppointments();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>5. Appointments (H3) + calendar sync (I3)</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-end gap-2 border-b border-outline-variant pb-3">
          <Input label="Test customer name" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
          <Button size="sm" variant="secondary" onClick={addCustomer}>
            Add customer
          </Button>
          <Select
            label="Customer"
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
            options={[{ value: "", label: "Select a customer" }, ...customers.map((c) => ({ value: c.id, label: c.name }))]}
          />
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <Select
            label="Service"
            value={serviceId}
            onChange={(e) => setServiceId(e.target.value)}
            options={[{ value: "", label: "Select a service" }, ...services.map((s) => ({ value: s.id, label: s.name }))]}
          />
          <Input
            label="Starts at"
            type="datetime-local"
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
          />
          <Button size="sm" onClick={createAppointment}>
            Book appointment
          </Button>
        </div>

        {error ? <p className="text-sm text-error">{error}</p> : null}

        <div className="flex flex-col gap-2">
          {appointments.length === 0 ? (
            <p className="text-sm text-on-surface-variant">No appointments yet.</p>
          ) : (
            appointments.map((a) => (
              <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-outline-variant px-3 py-2">
                <span className="text-sm text-on-surface">
                  {a.starts_at} — {a.status} — google_event_id: {a.google_event_id ?? "none"}
                </span>
                <div className="flex gap-2">
                  {a.status === "requested" ? (
                    <Button size="sm" variant="secondary" onClick={() => confirm(a.id)}>
                      Confirm
                    </Button>
                  ) : null}
                  <Button size="sm" variant="secondary" onClick={() => reschedule(a.id)}>
                    Reschedule
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => cancel(a.id)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
