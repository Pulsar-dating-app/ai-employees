// The default/catch-all service (services.is_default) is seeded with this
// exact literal name (migration 20260903170000_add_default_service.sql), and
// most merchants never rename it -- it exists as an internal "anything that
// plausibly fits" catch-all, not a name meant for a customer's ears. Chat
// testing: Ana confirmed a booking as "Serviço padrão: amanhã, segunda-feira,
// das 10h às 10h30", handing the customer the internal placeholder as if it
// were a real service.
//
// A dashboard-facing read of the same row (the merchant's own settings page,
// a confirmation email) is a different audience and is untouched by this --
// this only strips what an agent tool hands the model. If a merchant DOES
// rename it to something real ("Consulta Geral"), that name is exactly as
// real as any other service's name and is left alone.
const DEFAULT_SERVICE_PLACEHOLDER_NAME = "Serviço padrão";

function isPlaceholder(name: unknown): name is string {
  return typeof name === "string" && name.trim().toLowerCase() === DEFAULT_SERVICE_PLACEHOLDER_NAME.toLowerCase();
}

// Drops `field` (default `serviceName`) from a tool result when it is still
// the seeded placeholder, so there is nothing left for the model to parrot
// back to the customer. Any other value (a real service name, or the
// merchant's own rename) is left exactly as it was.
export function redactDefaultServiceName<T extends object>(result: T, field: string = "serviceName"): T {
  const rest = { ...result } as Record<string, unknown>;
  if (!isPlaceholder(rest[field])) return result;
  delete rest[field];
  return rest as T;
}
