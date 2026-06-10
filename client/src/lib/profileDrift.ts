// profileDrift — Phase F #5 (read side, no schema).
//
// Customers can edit their name/phone/address in the portal
// (portal.updateProfile), and nothing carried those edits back to the CRM.
// This comparator diffs the portal identity against the CRM record so the
// internal Overview can surface the drift with a review-gated one-click apply
// (per the reflection plan: portal→CRM changes go through staff review, never
// auto-write). Pure function — unit-tested, no React.

export interface CrmCustomerLike {
  firstName?: string | null;
  lastName?: string | null;
  displayName?: string | null;
  email?: string | null;
  mobilePhone?: string | null;
  homePhone?: string | null;
  workPhone?: string | null;
  addresses?: Array<{
    street?: string | null;
    unit?: string | null;
    city?: string | null;
    state?: string | null;
    zip?: string | null;
  }>;
}

export interface PortalCustomerLike {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
}

export interface DriftItem {
  field: 'name' | 'phone' | 'email' | 'address';
  label: string;
  portalValue: string;
  crmValue: string;
  /** customers.update payload for one-click apply; null = informational only */
  apply: Record<string, string> | null;
}

const collapse = (s: string) => s.trim().replace(/\s+/g, ' ');
const normName = (s: string) => collapse(s).toLowerCase();
const normEmail = (s: string) => s.trim().toLowerCase();
/** Last-10-digit comparison; strips a leading US country code. */
const digits = (s: string) => s.replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
const normAddr = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

export function computeProfileDrift(
  crm: CrmCustomerLike | null | undefined,
  portal: PortalCustomerLike | null | undefined,
): DriftItem[] {
  if (!crm || !portal) return [];
  const items: DriftItem[] = [];

  // Name: portal name vs CRM first+last (fall back to displayName).
  const crmName =
    collapse([crm.firstName, crm.lastName].filter(Boolean).join(' ')) ||
    collapse(crm.displayName ?? '');
  const portalName = collapse(portal.name ?? '');
  if (portalName && crmName && normName(portalName) !== normName(crmName)) {
    const [first, ...rest] = portalName.split(' ');
    items.push({
      field: 'name',
      label: 'Name',
      portalValue: portalName,
      crmValue: crmName,
      apply: { firstName: first, lastName: rest.join(' '), displayName: portalName },
    });
  }

  // Phone: drift only when the portal number matches none of the CRM numbers.
  const portalPhoneDigits = digits(portal.phone ?? '');
  if (portalPhoneDigits.length >= 7) {
    const crmPhones = [crm.mobilePhone, crm.homePhone, crm.workPhone]
      .map((p) => digits(p ?? ''))
      .filter(Boolean);
    if (!crmPhones.includes(portalPhoneDigits)) {
      items.push({
        field: 'phone',
        label: 'Phone',
        portalValue: collapse(portal.phone ?? ''),
        crmValue: collapse(crm.mobilePhone ?? '') || crmPhones[0] || 'none on file',
        apply: { mobilePhone: collapse(portal.phone ?? '') },
      });
    }
  }

  // Email: informational only — it is the portal login identity, so changing
  // either side is a bigger decision than one click.
  const portalEmail = normEmail(portal.email ?? '');
  const crmEmail = normEmail(crm.email ?? '');
  if (portalEmail && crmEmail && portalEmail !== crmEmail) {
    items.push({
      field: 'email',
      label: 'Email',
      portalValue: portalEmail,
      crmValue: crmEmail,
      apply: null,
    });
  }

  // Address: informational only — CRM addresses are structured records, so an
  // auto-apply from one free-text line would do more harm than good.
  const portalAddr = normAddr(portal.address ?? '');
  if (portalAddr) {
    const crmAddrs = (crm.addresses ?? []).map((a) =>
      normAddr([a.street, a.unit, a.city, a.state, a.zip].filter(Boolean).join(' ')),
    ).filter(Boolean);
    const matches = crmAddrs.some((a) => a.includes(portalAddr) || portalAddr.includes(a));
    if (crmAddrs.length > 0 && !matches) {
      items.push({
        field: 'address',
        label: 'Address',
        portalValue: collapse(portal.address ?? ''),
        crmValue: 'no matching address on file',
        apply: null,
      });
    }
  }

  return items;
}
