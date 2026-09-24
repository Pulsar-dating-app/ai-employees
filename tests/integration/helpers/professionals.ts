import { getTestServiceClient } from "./service-client";

// 2026-09-24 -- every company is seeded with one professional (migration
// 20260924120000); per-professional routes need its id.
export async function defaultProfessionalId(companyId: string): Promise<string> {
  const { data, error } = await getTestServiceClient()
    .from("professionals")
    .select("id")
    .eq("company_id", companyId)
    .order("created_at", { ascending: true })
    .limit(1)
    .single();
  if (error || !data) throw new Error(`defaultProfessionalId: ${error?.message ?? "no professional"}`);
  return data.id as string;
}

export async function calendarPath(companyId: string, professionalId?: string): Promise<string> {
  const id = professionalId ?? (await defaultProfessionalId(companyId));
  return `/api/companies/${companyId}/professionals/${id}/calendar`;
}
