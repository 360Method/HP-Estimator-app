// CustomerPortalTab — extracted from CustomerSection.tsx (Phase D5).
// Self-contained, prop-based (uses EstimatorContext directly). Markup moved verbatim.
import { useState, useRef } from 'react';
import {
  Calendar, CalendarPlus, Camera, CheckCircle2, DollarSign, ExternalLink, Eye,
  FileText, FileUp, RefreshCw, Trophy, User, Wrench, X,
} from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { useEstimator } from '@/contexts/EstimatorContext';
import { fmtDate, fmtDollar, fmtRelative } from '@/components/clients/formatters';
import ClientPortalPreview from '@/components/clients/ClientPortalPreview';
export default function CustomerPortalTab({ customerId }: { customerId: string }) {
  const utils = trpc.useUtils();
  const { approveEstimate, updateOpportunity, state } = useEstimator();
  const uploadFile = trpc.uploads.uploadFile.useMutation();
  const [previewOpen, setPreviewOpen] = useState(false);
  // Share Document modal
  const [showShareDoc, setShowShareDoc] = useState(false);
  const [docFile, setDocFile] = useState<File | null>(null);
  const [docName, setDocName] = useState('');
  const [docUploading, setDocUploading] = useState(false);
  const docFileRef = useRef<HTMLInputElement>(null);
  // Add Photo modal
  const [showAddPhoto, setShowAddPhoto] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoCaption, setPhotoCaption] = useState('');
  const [photoPhase, setPhotoPhase] = useState<'before' | 'during' | 'after'>('after');
  const [photoUploading, setPhotoUploading] = useState(false);
  const photoFileRef = useRef<HTMLInputElement>(null);
  // Schedule Appointment modal
  const [showScheduleAppt, setShowScheduleAppt] = useState(false);
  const [apptTitle, setApptTitle] = useState('');
  const [apptDate, setApptDate] = useState('');
  const [apptTime, setApptTime] = useState('09:00');
  const [apptEndTime, setApptEndTime] = useState('11:00');
  const [apptAddress, setApptAddress] = useState('');
  const [apptTech, setApptTech] = useState('');
  const [apptNotes, setApptNotes] = useState('');
  const addDocumentMutation = trpc.portal.addDocument.useMutation({
    onSuccess: () => {
      toast.success('Document shared with customer!');
      setShowShareDoc(false);
      setDocFile(null);
      setDocName('');
      utils.portal.getCustomerPortalData.invalidate({ hpCustomerId: customerId });
    },
    onError: (err) => toast.error(`Failed: ${err.message}`),
  });
  const addGalleryPhotoMutation = trpc.portal.addGalleryPhoto.useMutation({
    onSuccess: () => {
      toast.success('Photo added to customer gallery!');
      setShowAddPhoto(false);
      setPhotoFile(null);
      setPhotoCaption('');
      utils.portal.getCustomerPortalData.invalidate({ hpCustomerId: customerId });
    },
    onError: (err) => toast.error(`Failed: ${err.message}`),
  });
  const addAppointmentMutation = trpc.portal.addAppointment.useMutation({
    onSuccess: () => {
      toast.success('Appointment scheduled for customer!');
      setShowScheduleAppt(false);
      setApptTitle('');
      setApptDate('');
      utils.portal.getCustomerPortalData.invalidate({ hpCustomerId: customerId });
    },
    onError: (err) => toast.error(`Failed: ${err.message}`),
  });
  const handleShareDoc = async () => {
    if (!docFile || !docName.trim()) { toast.error('Select a file and enter a name'); return; }
    if (!data?.customer?.email) { toast.error('No portal customer email'); return; }
    setDocUploading(true);
    try {
      const base64 = await new Promise<string>((res, rej) => {
        const r = new FileReader();
        r.onload = ev => res(ev.target?.result as string);
        r.onerror = rej;
        r.readAsDataURL(docFile);
      });
      const uploaded = await uploadFile.mutateAsync({ filename: docFile.name, mimeType: docFile.type || 'application/octet-stream', base64, folder: 'portal-documents' });
      await addDocumentMutation.mutateAsync({ customerEmail: data.customer.email, name: docName.trim(), url: uploaded.url, fileKey: uploaded.key ?? uploaded.url, mimeType: docFile.type });
    } catch (e: any) { toast.error(e.message ?? 'Upload failed'); }
    setDocUploading(false);
  };
  const handleAddPhoto = async () => {
    if (!photoFile) { toast.error('Select a photo'); return; }
    if (!data?.customer?.email) { toast.error('No portal customer email'); return; }
    setPhotoUploading(true);
    try {
      const base64 = await new Promise<string>((res, rej) => {
        const r = new FileReader();
        r.onload = ev => res(ev.target?.result as string);
        r.onerror = rej;
        r.readAsDataURL(photoFile);
      });
      const uploaded = await uploadFile.mutateAsync({ filename: photoFile.name, mimeType: photoFile.type || 'image/jpeg', base64, folder: 'portal-gallery' });
      await addGalleryPhotoMutation.mutateAsync({ customerEmail: data.customer.email, imageUrl: uploaded.url, caption: photoCaption || undefined, phase: photoPhase });
    } catch (e: any) { toast.error(e.message ?? 'Upload failed'); }
    setPhotoUploading(false);
  };
  const handleScheduleAppt = () => {
    if (!apptTitle.trim() || !apptDate) { toast.error('Enter title and date'); return; }
    if (!data?.customer?.email) { toast.error('No portal customer email'); return; }
    const scheduledAt = new Date(`${apptDate}T${apptTime}:00`);
    const scheduledEndAt = apptEndTime ? new Date(`${apptDate}T${apptEndTime}:00`) : undefined;
    addAppointmentMutation.mutate({ customerEmail: data.customer.email, title: apptTitle.trim(), scheduledAt, scheduledEndAt, address: apptAddress || undefined, techName: apptTech || undefined, notes: apptNotes || undefined });
  };
  const { data, isLoading } = trpc.portal.getCustomerPortalData.useQuery(
    { hpCustomerId: customerId },
    { enabled: !!customerId }
  );
  const { data: allPortalMsgs = [] } = trpc.portal.getAllPortalMessages.useQuery();
  const { data: allServiceReqs = [] } = trpc.portal.getAllServiceRequests.useQuery();
  const reviewServiceRequest = trpc.portal.reviewServiceRequest.useMutation({
    onSuccess: () => {
      toast.success('Request updated!');
      utils.portal.getCustomerPortalData.invalidate({ hpCustomerId: customerId });
    },
    onError: (err) => toast.error(err.message),
  });
  const resendEstimate = trpc.portal.resendEstimate.useMutation({
    onSuccess: () => {
      toast.success('Estimate email resent!');
      utils.portal.getCustomerPortalData.invalidate({ hpCustomerId: customerId });
    },
    onError: (err) => toast.error(`Resend failed: ${err.message}`),
  });
  const resendInvoice = trpc.portal.resendInvoice.useMutation({
    onSuccess: () => {
      toast.success('Invoice email resent!');
      utils.portal.getCustomerPortalData.invalidate({ hpCustomerId: customerId });
    },
    onError: (err) => toast.error(`Resend failed: ${err.message}`),
  });

  if (isLoading) {
    return <div className="py-16 text-center text-muted-foreground text-sm">Loading portal data…</div>;
  }

  if (!data?.customer) {
    return (
      <div className="text-center py-16 text-muted-foreground border-2 border-dashed border-border rounded-xl">
        <ExternalLink className="w-8 h-8 mx-auto mb-3 opacity-30" />
        <div className="text-base font-semibold mb-1">No Portal Account Yet</div>
        <div className="text-sm">Send an estimate or invoice to this customer to create their portal.</div>
      </div>
    );
  }

  const { customer, estimates, invoices, appointments } = data;
  // Filter messages and service requests to this portal customer
  const customerMsgs = (allPortalMsgs as any[]).filter(
    (m: any) => m.customerId === customer.id
  );
  const customerServiceReqs = (allServiceReqs as any[]).filter(
    (r: any) => r.customerId === customer.id
  );
  const portalBase = 'https://client.handypioneers.com';

  return (
    <div className="space-y-5">
      {/* Portal customer header */}
      <div className="rounded-xl border border-[#e7e1d4] bg-white p-4 flex items-center gap-4">
        <div className="w-10 h-10 rounded-full bg-[#1a2e1a] flex items-center justify-center shrink-0">
          <User size={18} className="text-[#e2b96a]" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm truncate">{customer.name}</p>
          <p className="text-xs text-muted-foreground truncate">{customer.email}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Portal ID: #{customer.id}
            {customer.createdAt && (
              <span className="ml-2 text-emerald-600">Active since {new Date(customer.createdAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</span>
            )}
          </p>
        </div>
        <button
          onClick={() => setPreviewOpen(true)}
          className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-[#c8922a] text-white rounded-lg text-xs font-semibold hover:bg-[#a07320] transition-colors"
        >
          <Eye size={12} /> View as customer
        </button>
        <a
          href={`${portalBase}/portal/home`}
          target="_blank"
          rel="noreferrer"
          className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-[#1a2e1a] text-white rounded-lg text-xs font-semibold hover:bg-[#243c24] transition-colors"
        >
          <ExternalLink size={12} /> View in Portal
        </a>
      </div>
      {previewOpen && <ClientPortalPreview onClose={() => setPreviewOpen(false)} />}

      {/* Estimates */}
      <div>
        <h3 className="text-xs font-semibold text-[#5b574f] uppercase tracking-wider mb-2">
          Estimates ({estimates.length})
        </h3>
        {estimates.length === 0 ? (
          <p className="text-xs text-muted-foreground">No estimates sent to portal yet.</p>
        ) : (
          <div className="space-y-2">
            {estimates.map((est: any) => (
              <div key={est.id} className="rounded-xl border border-[#e7e1d4] bg-white p-3 flex flex-col gap-2">
                <div className="flex items-start gap-3">
                  <FileText size={16} className="text-muted-foreground shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{est.estimateNumber} — {est.title}</p>
                    <p className="text-xs text-muted-foreground">
                      Sent {est.sentAt ? fmtDate(new Date(est.sentAt).toISOString()) : '—'}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {est.viewedAt && (
                      <span
                        title={`Viewed ${fmtDate(new Date(est.viewedAt).toISOString())}`}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-xs font-semibold"
                      >
                        <CheckCircle2 size={11} /> Viewed
                      </span>
                    )}
                    <Badge className={
                      est.status === 'approved' ? 'bg-emerald-100 text-emerald-800' :
                      est.status === 'declined' ? 'bg-red-100 text-red-700' :
                      'bg-sky-100 text-sky-700'
                    }>
                      {est.status}
                    </Badge>
                  </div>
                </div>
                <div className="flex items-center justify-between pl-7">
                  {est.viewedAt ? (
                    <p className="text-xs text-emerald-600">Viewed {fmtRelative(new Date(est.viewedAt).toISOString())}</p>
                  ) : (
                    <p className="text-xs text-muted-foreground">Not yet viewed</p>
                  )}
                  <div className="flex items-center gap-1.5">
                    {est.status === 'approved' && (() => {
                      // Check if the linked opportunity is already marked Won
                      const linkedOpp = est.hpOpportunityId
                        ? state.opportunities.find((o: any) => o.id === est.hpOpportunityId)
                        : null;
                      const alreadyWon = linkedOpp?.wonAt || linkedOpp?.stage === 'Won' || linkedOpp?.stage === 'Approved';
                      if (alreadyWon) return (
                        <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-xs font-semibold">
                          <Trophy size={10} /> Won
                        </span>
                      );
                      return (
                        <button
                          onClick={() => {
                            if (!est.hpOpportunityId) {
                              toast.error('No linked opportunity — re-send the estimate to link it.');
                              return;
                            }
                            approveEstimate({
                              estimateId: est.hpOpportunityId,
                              jobMode: 'new',
                              newJobTitle: est.title,
                              totalPrice: (est.totalAmount ?? 0) / 100,
                              depositAmount: (est.depositAmount ?? 0) / 100,
                              depositLabel: `Deposit (${est.depositPercent ?? 50}%)`,
                              balanceAmount: ((est.totalAmount ?? 0) - (est.depositAmount ?? 0)) / 100,
                              signedEstimateDataUrl: est.signatureDataUrl ?? undefined,
                            });
                            toast.success('Estimate marked Won — job created!');
                          }}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 transition-colors"
                        >
                          <Trophy size={11} /> Mark Won
                        </button>
                      );
                    })()}
                    <button
                      onClick={() => resendEstimate.mutate({ estimateId: est.id })}
                      disabled={resendEstimate.isPending}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-border text-xs font-medium hover:bg-muted transition-colors disabled:opacity-50"
                    >
                      <RefreshCw size={11} className={resendEstimate.isPending ? 'animate-spin' : ''} />
                      Resend
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Invoices */}
      <div>
        <h3 className="text-xs font-semibold text-[#5b574f] uppercase tracking-wider mb-2">
          Invoices ({invoices.length})
        </h3>
        {invoices.length === 0 ? (
          <p className="text-xs text-muted-foreground">No invoices sent to portal yet.</p>
        ) : (
          <div className="space-y-2">
            {invoices.map((inv: any) => (
              <div key={inv.id} className="rounded-xl border border-[#e7e1d4] bg-white p-3 flex flex-col gap-2">
                <div className="flex items-start gap-3">
                  <DollarSign size={16} className="text-muted-foreground shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{inv.invoiceNumber} — {inv.jobTitle ?? inv.type}</p>
                    <p className="text-xs text-muted-foreground">
                      {fmtDollar((inv.amountDue ?? 0) / 100)} · Due {inv.dueDate ? fmtDate(new Date(inv.dueDate).toISOString()) : '—'}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {inv.viewedAt && (
                      <span
                        title={`Viewed ${fmtDate(new Date(inv.viewedAt).toISOString())}`}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-xs font-semibold"
                      >
                        <CheckCircle2 size={11} /> Viewed
                      </span>
                    )}
                    {inv.status === 'paid' && (
                      <Badge className="bg-emerald-100 text-emerald-800 flex items-center gap-1">
                        <CheckCircle2 size={10} /> Paid via Portal
                      </Badge>
                    )}
                    {inv.status !== 'paid' && inv.dueDate && new Date(inv.dueDate) < new Date() && (
                      <Badge className="bg-red-100 text-red-700 border-red-300">Overdue</Badge>
                    )}
                    {inv.status !== 'paid' && !(inv.dueDate && new Date(inv.dueDate) < new Date()) && (
                      <Badge className={
                        inv.status === 'due' ? 'bg-orange-100 text-orange-700' :
                        'bg-sky-100 text-sky-700'
                      }>
                        {inv.status}
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-between pl-7">
                  <div>
                    {inv.status === 'paid' && inv.paidAt ? (
                      <p className="text-xs text-emerald-600">
                        Paid {fmtRelative(new Date(inv.paidAt).toISOString())} · {fmtDollar((inv.amountPaid ?? 0) / 100)}
                      </p>
                    ) : inv.viewedAt ? (
                      <p className="text-xs text-emerald-600">Viewed {fmtRelative(new Date(inv.viewedAt).toISOString())}</p>
                    ) : (
                      <p className="text-xs text-muted-foreground">Not yet viewed</p>
                    )}
                  </div>
                  <button
                    onClick={() => resendInvoice.mutate({ invoiceId: inv.id })}
                    disabled={resendInvoice.isPending}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-border text-xs font-medium hover:bg-muted transition-colors disabled:opacity-50"
                  >
                    <RefreshCw size={11} className={resendInvoice.isPending ? 'animate-spin' : ''} />
                    Resend
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Appointments */}
      {appointments.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-[#5b574f] uppercase tracking-wider mb-2">
            Appointments ({appointments.length})
          </h3>
          <div className="space-y-2">
            {appointments.map((apt: any) => (
              <div key={apt.id} className="rounded-xl border border-[#e7e1d4] bg-white p-3 flex items-center gap-3">
                <Calendar size={16} className="text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{apt.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {apt.startTime ? fmtDate(new Date(apt.startTime).toISOString()) : '—'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Service Requests (Booking) */}
      {customerServiceReqs.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-[#5b574f] uppercase tracking-wider mb-2">
            Service Requests ({customerServiceReqs.length})
          </h3>
          <div className="space-y-2">
            {customerServiceReqs.map((req: any) => (
              <div key={req.id} className="rounded-xl border border-[#e7e1d4] bg-white p-3 space-y-2">
                <div className="flex items-start gap-3">
                  <Wrench size={15} className="text-muted-foreground shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium line-clamp-2">{req.description}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {req.preferredTimeline ? `Timeline: ${req.preferredTimeline.replace('_', ' ')}` : ''}
                      {req.address ? ` · ${req.address}` : ''}
                    </p>
                  </div>
                  <span className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                    req.status === 'pending' ? 'bg-amber-100 text-amber-700' :
                    req.status === 'reviewed' ? 'bg-sky-100 text-sky-700' :
                    req.status === 'converted' ? 'bg-emerald-100 text-emerald-700' :
                    'bg-muted text-muted-foreground'
                  }`}>{req.status}</span>
                </div>
                {req.status === 'pending' && (
                  <div className="flex gap-2 pl-6">
                    <button
                      onClick={() => reviewServiceRequest.mutate({ id: req.id, status: 'reviewed' })}
                      disabled={reviewServiceRequest.isPending}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-sky-50 border border-sky-200 text-sky-700 text-xs font-medium hover:bg-sky-100 transition-colors disabled:opacity-50"
                    >
                      Mark Reviewed
                    </button>
                    <button
                      onClick={() => reviewServiceRequest.mutate({ id: req.id, status: 'converted' })}
                      disabled={reviewServiceRequest.isPending}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-medium hover:bg-emerald-100 transition-colors disabled:opacity-50"
                    >
                      Convert to Lead
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* HP Action Buttons */}
      <div>
        <h3 className="text-xs font-semibold text-[#5b574f] uppercase tracking-wider mb-2">
          Push to Portal
        </h3>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setShowShareDoc(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-xs font-medium hover:bg-muted transition-colors"
          >
            <FileUp size={13} /> Share Document
          </button>
          <button
            onClick={() => setShowAddPhoto(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-xs font-medium hover:bg-muted transition-colors"
          >
            <Camera size={13} /> Add Photo
          </button>
          <button
            onClick={() => setShowScheduleAppt(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-xs font-medium hover:bg-muted transition-colors"
          >
            <CalendarPlus size={13} /> Schedule Appointment
          </button>
        </div>
      </div>

      {/* Share Document Modal */}
      {showShareDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowShareDoc(false)}>
          <div className="bg-card rounded-2xl shadow-2xl p-6 w-full max-w-md space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-base">Share Document with Customer</h2>
              <button onClick={() => setShowShareDoc(false)} className="text-muted-foreground hover:text-foreground"><X size={18} /></button>
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Document Name</label>
              <input
                type="text" value={docName} onChange={e => setDocName(e.target.value)}
                placeholder="e.g. Scope of Work — Kitchen Remodel"
                className="field-input w-full"
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">File</label>
              <input
                ref={docFileRef} type="file" className="hidden"
                onChange={e => setDocFile(e.target.files?.[0] ?? null)}
              />
              <button
                onClick={() => docFileRef.current?.click()}
                className="flex items-center gap-2 px-3 py-2 border border-dashed border-border rounded-lg text-xs text-muted-foreground hover:border-primary hover:text-primary transition-colors w-full"
              >
                <FileUp size={14} />
                {docFile ? docFile.name : 'Click to select file'}
              </button>
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={handleShareDoc}
                disabled={docUploading || addDocumentMutation.isPending}
                className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {docUploading ? 'Uploading…' : 'Share'}
              </button>
              <button onClick={() => setShowShareDoc(false)} className="px-4 py-2 border border-border rounded-lg text-sm hover:bg-muted transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Photo Modal */}
      {showAddPhoto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowAddPhoto(false)}>
          <div className="bg-card rounded-2xl shadow-2xl p-6 w-full max-w-md space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-base">Add Photo to Customer Gallery</h2>
              <button onClick={() => setShowAddPhoto(false)} className="text-muted-foreground hover:text-foreground"><X size={18} /></button>
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Photo</label>
              <input
                ref={photoFileRef} type="file" accept="image/*" className="hidden"
                onChange={e => setPhotoFile(e.target.files?.[0] ?? null)}
              />
              <button
                onClick={() => photoFileRef.current?.click()}
                className="flex items-center gap-2 px-3 py-2 border border-dashed border-border rounded-lg text-xs text-muted-foreground hover:border-primary hover:text-primary transition-colors w-full"
              >
                <Camera size={14} />
                {photoFile ? photoFile.name : 'Click to select photo'}
              </button>
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Caption (optional)</label>
              <input
                type="text" value={photoCaption} onChange={e => setPhotoCaption(e.target.value)}
                placeholder="e.g. After — new kitchen backsplash"
                className="field-input w-full"
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Phase</label>
              <select value={photoPhase} onChange={e => setPhotoPhase(e.target.value as any)} className="field-input w-full">
                <option value="before">Before</option>
                <option value="during">During</option>
                <option value="after">After</option>
              </select>
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={handleAddPhoto}
                disabled={photoUploading || addGalleryPhotoMutation.isPending}
                className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {photoUploading ? 'Uploading…' : 'Add Photo'}
              </button>
              <button onClick={() => setShowAddPhoto(false)} className="px-4 py-2 border border-border rounded-lg text-sm hover:bg-muted transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Schedule Appointment Modal */}
      {showScheduleAppt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowScheduleAppt(false)}>
          <div className="bg-card rounded-2xl shadow-2xl p-6 w-full max-w-md space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-base">Schedule Appointment</h2>
              <button onClick={() => setShowScheduleAppt(false)} className="text-muted-foreground hover:text-foreground"><X size={18} /></button>
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Title</label>
              <input
                type="text" value={apptTitle} onChange={e => setApptTitle(e.target.value)}
                placeholder="e.g. Site Visit — Kitchen Remodel"
                className="field-input w-full"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Date</label>
                <input type="date" value={apptDate} onChange={e => setApptDate(e.target.value)} className="field-input w-full" />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Start Time</label>
                <input type="time" value={apptTime} onChange={e => setApptTime(e.target.value)} className="field-input w-full" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-muted-foreground mb-1">End Time</label>
                <input type="time" value={apptEndTime} onChange={e => setApptEndTime(e.target.value)} className="field-input w-full" />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Technician</label>
                <input
                  type="text" value={apptTech} onChange={e => setApptTech(e.target.value)}
                  placeholder="Tech name"
                  className="field-input w-full"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Address (optional)</label>
              <input
                type="text" value={apptAddress} onChange={e => setApptAddress(e.target.value)}
                placeholder="Job site address"
                className="field-input w-full"
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Notes (optional)</label>
              <textarea
                value={apptNotes} onChange={e => setApptNotes(e.target.value)}
                placeholder="Any notes for the customer…"
                rows={2} className="field-input w-full resize-none"
              />
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={handleScheduleAppt}
                disabled={addAppointmentMutation.isPending}
                className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {addAppointmentMutation.isPending ? 'Scheduling…' : 'Schedule'}
              </button>
              <button onClick={() => setShowScheduleAppt(false)} className="px-4 py-2 border border-border rounded-lg text-sm hover:bg-muted transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Portal Messages Preview */}
      {customerMsgs.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-[#5b574f] uppercase tracking-wider mb-2">
            Portal Messages ({customerMsgs.length})
          </h3>
          <div className="space-y-1.5">
            {[...customerMsgs].sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 5).map((msg: any) => (
              <div key={msg.id} className={`rounded-lg p-2.5 text-xs flex gap-2 ${
                msg.senderRole === 'hp_team' ? 'bg-[#1a2e1a]/5 border border-[#1a2e1a]/10' : 'bg-muted'
              }`}>
                <span className={`shrink-0 font-semibold ${
                  msg.senderRole === 'hp_team' ? 'text-[#1a2e1a]' : 'text-amber-700'
                }`}>
                  {msg.senderRole === 'hp_team' ? 'HP Team' : (msg.senderName || 'Customer')}:
                </span>
                <span className="text-foreground/80 line-clamp-2">{msg.body}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
