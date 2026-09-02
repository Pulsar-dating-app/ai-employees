// Trello R2 -- the typed, stable-keyed intake model shared by the
// settings route (validates a merchant's field config) and
// AppointmentRepository (validates a customer's answers at booking).

export type IntakeFieldType = "email" | "name" | "phone" | "cpf" | "date" | "text";

export type PredefinedIntakeField = {
  key: string;
  label: string;
  fieldType: IntakeFieldType;
  // Whether the merchant may toggle enable/require. `email` is locked: it
  // is always collected and always required -- no booking without one.
  locked: boolean;
  defaultEnabled: boolean;
  defaultRequired: boolean;
};

// The fixed core set every company gets (seeded by a DB trigger, see
// migration 20260902140000). Order here is the display order.
export const PREDEFINED_INTAKE_FIELDS: readonly PredefinedIntakeField[] = [
  { key: "email", label: "Email", fieldType: "email", locked: true, defaultEnabled: true, defaultRequired: true },
  { key: "full_name", label: "Nome completo", fieldType: "name", locked: false, defaultEnabled: true, defaultRequired: true },
  { key: "phone", label: "Telefone", fieldType: "phone", locked: false, defaultEnabled: false, defaultRequired: false },
  { key: "cpf", label: "CPF", fieldType: "cpf", locked: false, defaultEnabled: false, defaultRequired: false },
  { key: "date_of_birth", label: "Data de nascimento", fieldType: "date", locked: false, defaultEnabled: false, defaultRequired: false },
] as const;

export const PREDEFINED_INTAKE_KEYS: ReadonlySet<string> = new Set(
  PREDEFINED_INTAKE_FIELDS.map((f) => f.key),
);

export const EMAIL_INTAKE_KEY = "email";

// customers columns a known field type maps onto -- an answer to one of
// these is written to the customers row as well as intake_answers.
export const FIELD_TYPE_TO_CUSTOMER_COLUMN: Partial<Record<IntakeFieldType, "name" | "email" | "phone">> = {
  name: "name",
  email: "email",
  phone: "phone",
};

// A slug for a custom field's label. Same shape the migration's backfill
// produces; de-duplication (appending _2, _3) is the caller's job since it
// needs the sibling list.
export function slugifyIntakeLabel(label: string): string {
  const slug = label
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  return slug || "campo";
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_RE = /^\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4}$/;

// Light, forgiving validation -- enough to stop "sim" being stored as an
// email or a name in the CPF slot, not a full spec check. Returns null when
// the value is acceptable, or a short reason string for the agent to relay.
export function validateIntakeAnswer(fieldType: IntakeFieldType, raw: string): string | null {
  const value = raw.trim();
  if (value === "") return "empty";
  switch (fieldType) {
    case "email":
      return EMAIL_RE.test(value) ? null : "not_an_email";
    case "phone":
      return (value.match(/\d/g)?.length ?? 0) >= 8 ? null : "not_a_phone";
    case "cpf":
      return (value.match(/\d/g)?.length ?? 0) === 11 ? null : "not_a_cpf";
    case "date":
      return DATE_RE.test(value) || !Number.isNaN(Date.parse(value)) ? null : "not_a_date";
    case "name":
    case "text":
      return null;
  }
}
