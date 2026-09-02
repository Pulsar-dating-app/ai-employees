import { describe, expect, it } from "vitest";
import {
  renderConfirmationEmail,
  renderReminderEmail,
  renderDeclinedEmail,
  type AppointmentEmailData,
} from "@/lib/email/templates";

const data: AppointmentEmailData = {
  businessName: "Studio Aurora",
  serviceName: "Consulta inicial",
  whenText: "Thursday, 12 June at 2:00 PM",
  businessNote: null,
  contact: "contact Studio Aurora at hi@aurora.test",
};

describe("appointment email templates", () => {
  it("confirmation carries the who/what/when in subject + text + html", () => {
    const e = renderConfirmationEmail(data);
    expect(e.subject).toContain("Studio Aurora");
    for (const body of [e.text, e.html]) {
      expect(body).toContain("Consulta inicial");
      expect(body).toContain("Thursday, 12 June at 2:00 PM");
      expect(body).toContain("Studio Aurora");
    }
    expect(e.text).toContain("hi@aurora.test");
  });

  it("reminder reads as a reminder, not a fresh confirmation", () => {
    const e = renderReminderEmail(data);
    expect(e.subject.toLowerCase()).toContain("reminder");
    expect(e.text).toContain("Consulta inicial");
  });

  it("declined explains it couldn't be confirmed", () => {
    const e = renderDeclinedEmail(data);
    expect(e.subject.toLowerCase()).toContain("couldn't be confirmed");
    expect(e.text).toContain("Studio Aurora");
    expect(e.text).toContain("Consulta inicial");
  });

  it("escapes HTML-special characters in the business/service name", () => {
    const e = renderConfirmationEmail({ ...data, businessName: "A & B <Salon>" });
    expect(e.html).toContain("A &amp; B &lt;Salon&gt;");
    expect(e.html).not.toContain("<Salon>");
  });

  it("falls back to a generic 'reply to the chat' line with no contact", () => {
    const e = renderConfirmationEmail({ ...data, contact: null });
    expect(e.text).toContain("reply to the chat");
  });
});
