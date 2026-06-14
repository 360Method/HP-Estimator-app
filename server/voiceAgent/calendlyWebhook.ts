/**
 * Calendly webhook -> portal sync. When a caller taps their link and confirms,
 * Calendly fires invitee.created; we match them to their lead and run the normal
 * appointment-booked flow (reassign to the consultant, notify, confirm), so a
 * phone-sourced booking lands in the portal exactly like any other.
 */
import { findCustomerByEmail, findCustomerByPhone, listOpportunities } from "../db";
import { onAppointmentBooked } from "../leadRouting";
import { formatPacific } from "./calendly";

function extractPhone(p: any): string | null {
  const qa: Array<{ answer?: string }> = p?.questions_and_answers || [];
  for (const q of qa) {
    const digits = (q.answer || "").replace(/\D/g, "");
    if (digits.length >= 10) return digits;
  }
  if (p?.text_reminder_number) return String(p.text_reminder_number);
  return null;
}

export async function handleCalendlyEvent(body: any): Promise<void> {
  if (body?.event !== "invitee.created") return;
  const p = body?.payload || {};
  const email = String(p.email || "").toLowerCase().trim();
  const name = String(p.name || "").trim();
  const start = p?.scheduled_event?.start_time || p?.event?.start_time;
  if (!start) {
    console.warn("[calendly] invitee.created with no start_time; skipping");
    return;
  }

  let customer = email ? await findCustomerByEmail(email) : null;
  if (!customer) {
    const phone = extractPhone(p);
    if (phone) customer = await findCustomerByPhone(phone);
  }
  if (!customer) {
    console.warn(`[calendly] booking for unknown invitee (${email || "no email"}); skipping sync`);
    return;
  }

  const opps = (await listOpportunities("lead", customer.id)).filter((o) => !o.archived);
  const opp = opps[0];
  if (!opp) {
    console.warn(`[calendly] no open lead for customer ${customer.id}; skipping sync`);
    return;
  }

  await onAppointmentBooked({
    opportunityId: opp.id,
    customerId: customer.id,
    title: opp.title || `${name || customer.displayName} — Assessment`,
    when: formatPacific(start),
    appointmentType: "consultation",
  });
  console.log(`[calendly] synced booking for ${customer.id} (opp ${opp.id}) @ ${start}`);
}
