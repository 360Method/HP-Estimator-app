/**
 * profileSync — CRM → portal profile auto-sync (Phase F #5, auto direction).
 *
 * The CRM is the source of truth for customer identity: when staff edit a
 * customer, the linked portal profile follows automatically. The reverse
 * (portal→CRM) stays review-gated via the ClientProfileDrift card.
 */

export interface CrmProfileFields {
  firstName?: string | null;
  lastName?: string | null;
  displayName?: string | null;
  mobilePhone?: string | null;
  street?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
}

const collapse = (s: string | null | undefined) => (s ?? '').trim().replace(/\s+/g, ' ');

/**
 * Build the portalCustomers patch for a CRM customer update. Only fields the
 * staff actually touched are considered, and a field is pushed only when the
 * resulting value is non-empty and differs from the portal's current value.
 * Returns null when there is nothing to push.
 */
export function buildPortalProfilePatch(
  touched: Partial<CrmProfileFields>,
  customer: CrmProfileFields,
  portal: { name?: string | null; phone?: string | null; address?: string | null },
): { name?: string; phone?: string; address?: string } | null {
  const patch: { name?: string; phone?: string; address?: string } = {};

  if ('firstName' in touched || 'lastName' in touched || 'displayName' in touched) {
    const name =
      collapse([customer.firstName, customer.lastName].filter(Boolean).join(' ')) ||
      collapse(customer.displayName);
    if (name && name !== collapse(portal.name)) patch.name = name;
  }

  if ('mobilePhone' in touched) {
    const phone = collapse(customer.mobilePhone);
    if (phone && phone !== collapse(portal.phone)) patch.phone = phone;
  }

  if ('street' in touched || 'city' in touched || 'state' in touched || 'zip' in touched) {
    const address = collapse(
      [customer.street, customer.city, customer.state, customer.zip].filter(Boolean).join(', '),
    );
    if (address && address !== collapse(portal.address)) patch.address = address;
  }

  return Object.keys(patch).length ? patch : null;
}
