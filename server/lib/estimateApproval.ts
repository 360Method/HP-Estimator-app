/**
 * server/lib/estimateApproval.ts
 *
 * The one true estimate-approval pipeline, extracted verbatim from
 * portal.approveEstimate so the portal (customer signs in their own session)
 * and the on-site close flow (customer signs on the consultant's device,
 * witnessed) share the exact same downstream behavior: signature upload,
 * approved status, deposit invoice, opportunity Won + SSE broadcast,
 * confirmation email, owner notification, estimate_approved automation.
 *
 * In-person approvals add channel 'in_person' plus a recorded attestation
 * (witnessing staff user, device, timestamp) persisted on the estimate row.
 * Everything after the signature is identical by construction.
 */
import { TRPCError } from "@trpc/server";
import {
  getPortalEstimateById,
  updatePortalEstimateStatus,
  createPortalInvoice,
} from "../portalDb";
import { updateOpportunity } from "../db";
import { sendEmail } from "../gmail";
import { notifyOwner } from "../_core/notification";
import { storagePut } from "../storage";
import { broadcastOpportunityUpdate } from "../sse";
import { runAutomationsForTrigger } from "../automationEngine";
import { getOrCreateAppSettings } from "../routers/appSettings";
import { emailWrapper, ctaButton } from "./email/hpEmailTheme";

export type ApprovalChannel = "portal" | "in_person";

export interface ApprovalAttestation {
  witnessUserId: number;
  witnessName: string;
  device: string;
  signedAt: string;
}

export interface ApprovingCustomer {
  id: number;
  name: string;
  email: string;
  phone?: string | null;
}

/** Uploads a base64 signature image to S3; falls back to the raw dataUrl. */
export async function uploadSignatureToS3(dataUrl: string, prefix: string): Promise<string> {
  try {
    // Strip the data:image/png;base64, prefix
    const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64, 'base64');
    const key = `signatures/${prefix}-${Date.now()}.png`;
    const { url } = await storagePut(key, buffer, 'image/png');
    return url;
  } catch (err) {
    console.warn('[portal] Signature S3 upload failed, storing as dataUrl:', err);
    return dataUrl; // graceful fallback
  }
}

/**
 * Replaces {{variable}} tokens in a template string with values from vars.
 * Returns null if template is empty so callers can fall back to hardcoded HTML.
 */
function interpolateTemplate(
  template: string | null | undefined,
  vars: Record<string, string | undefined>,
): string | null {
  if (!template?.trim()) return null;
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`);
}

function buildApprovalConfirmationEmail(
  name: string,
  estimateNumber: string,
  title: string,
  depositFmt: string | null,
  invoiceUrl: string,
) {
  const firstName = name.split(' ')[0];
  const depositSection = depositFmt
    ? `<p style="margin:0 0 20px;">To get your project scheduled, please pay the <strong>${depositFmt} deposit</strong> using the button below.</p>
       ${ctaButton('Pay Deposit Now', invoiceUrl, '#1a2e1a')}`
    : `<p style="margin:0 0 20px;">Our team will be in touch shortly to schedule your project.</p>`;
  return emailWrapper(`
    <h2 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#1a2e1a;">Estimate Approved. Thank You!</h2>
    <p style="margin:0 0 12px;">Hi ${firstName},</p>
    <p style="margin:0 0 8px;">We've received your approval for estimate <strong>${estimateNumber}</strong>:</p>
    <p style="margin:0 0 20px;padding:12px 16px;background:#f8f9fa;border-left:3px solid #1a2e1a;border-radius:0 4px 4px 0;font-weight:600;color:#1a2e1a;">${title}</p>
    ${depositSection}
    <p style="margin:0;font-size:13px;color:#888;text-align:center;">Questions? <a href="mailto:help@handypioneers.com" style="color:#c8922a;">Reply to this email</a> or call us at (360) 838-6731.</p>
  `);
}

export async function approvePortalEstimate(opts: {
  estimateId: number;
  signerName: string;
  signatureDataUrl: string;
  channel: ApprovalChannel;
  attestation?: ApprovalAttestation;
  portalCustomer: ApprovingCustomer;
}) {
  const { estimateId, signerName, signatureDataUrl, channel, attestation, portalCustomer } = opts;

  const est = await getPortalEstimateById(estimateId);
  if (!est || est.customerId !== portalCustomer.id) {
    throw new TRPCError({ code: "NOT_FOUND" });
  }
  if (est.status === "approved") {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Already approved" });
  }

  // Upload signature to S3 and store CDN URL instead of raw base64
  const sigUrl = await uploadSignatureToS3(
    signatureDataUrl,
    `est-${estimateId}-${portalCustomer.id}`
  );

  await updatePortalEstimateStatus(estimateId, "approved", {
    approvedAt: new Date(),
    signerName,
    signatureDataUrl: sigUrl,
    approvalChannel: channel,
    ...(attestation ? { approvalAttestation: JSON.stringify(attestation) } : {}),
  });

  // Auto-create deposit invoice if deposit > 0
  let depositInvoice = null;
  if (est.depositAmount > 0) {
    depositInvoice = await createPortalInvoice({
      customerId: est.customerId,
      estimateId: est.id,
      invoiceNumber: `DEP-${est.estimateNumber}`,
      type: "deposit",
      status: "due",
      amountDue: est.depositAmount,
      amountPaid: 0,
      tipAmount: 0,
      dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
      jobTitle: est.title,
      lineItemsJson: est.lineItemsJson,
      sentAt: new Date(),
    });
  }

  // Mark pro-side opportunity as won (if linked) and broadcast SSE update
  if (est.hpOpportunityId) {
    const now = new Date().toISOString();
    await updateOpportunity(est.hpOpportunityId, {
      stage: 'Won',
      wonAt: now,
      portalApprovedAt: now,
    }).catch((e: unknown) => {
      console.warn('[estimateApproval] Could not mark opportunity won:', e);
    });
    broadcastOpportunityUpdate(est.hpOpportunityId, {
      stage: 'Won',
      wonAt: now,
      portalApprovedAt: now,
      updatedAt: now,
    });
  }

  // Send approval confirmation email to customer
  const baseUrl = process.env.PORTAL_BASE_URL ?? 'https://client.handypioneers.com';
  const depositFmt = est.depositAmount > 0
    ? `$${(est.depositAmount / 100).toFixed(2)}`
    : null;
  const invoiceUrl = depositInvoice
    ? `${baseUrl}/portal/invoices/${depositInvoice.id}`
    : `${baseUrl}/portal/invoices`;
  if (portalCustomer.email) {
    const appCfg = await getOrCreateAppSettings().catch(() => null);
    const tmplVars = {
      customerName: portalCustomer.name,
      customerFirstName: portalCustomer.name?.split(' ')[0],
      email: portalCustomer.email,
      referenceNumber: est.estimateNumber,
      description: est.title ?? 'Your Project',
      amount: depositFmt ?? '',
      invoiceUrl,
      portalUrl: baseUrl,
    };
    const approvalSubject = appCfg?.emailEstimateApprovedSubject?.trim() || `Your estimate is approved. Thank you!`;
    const approvalHtml = interpolateTemplate(appCfg?.emailEstimateApprovedBody, tmplVars)
      ? `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">${interpolateTemplate(appCfg?.emailEstimateApprovedBody, tmplVars)!.replace(/\n/g, '<br/>')}</div>`
      : buildApprovalConfirmationEmail(portalCustomer.name, est.estimateNumber, est.title ?? 'Your Project', depositFmt, invoiceUrl);
    await sendEmail({ to: portalCustomer.email, subject: approvalSubject, html: approvalHtml }).catch(() => null);
  }

  // Notify HP team
  const signedHow = channel === 'in_person'
    ? `signed in person${attestation?.witnessName ? `, witnessed by ${attestation.witnessName}` : ''}`
    : 'signed electronically';
  await notifyOwner({
    title: `✅ Estimate Approved: ${est.estimateNumber}`,
    content: `${portalCustomer.name} approved estimate ${est.estimateNumber} (${est.title}) and ${signedHow}.${est.hpOpportunityId ? ` Opportunity ${est.hpOpportunityId} marked Won.` : ''}`,
  }).catch(() => null);

  // Fire estimate_approved automation (non-blocking)
  runAutomationsForTrigger('estimate_approved', {
    customerName: portalCustomer.name,
    customerFirstName: portalCustomer.name?.split(' ')[0],
    email: portalCustomer.email,
    phone: portalCustomer.phone ?? undefined,
    referenceNumber: est.estimateNumber,
    amount: est.totalAmount ? `$${(est.totalAmount / 100).toFixed(2)}` : undefined,
    description: est.title ?? undefined,
  }).catch(e => console.error('[automation] estimate_approved error:', e));

  return { estimate: await getPortalEstimateById(estimateId), depositInvoice };
}
