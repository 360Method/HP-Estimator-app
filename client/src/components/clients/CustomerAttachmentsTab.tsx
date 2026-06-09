// CustomerAttachmentsTab — extracted from CustomerSection.tsx (Phase D5).
// Self-contained, prop-based (uses EstimatorContext directly). Markup moved verbatim.
import { useRef } from 'react';
import { Download, FileText, Paperclip, Plus, Trash2 } from 'lucide-react';
import { nanoid } from 'nanoid';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';
import { useEstimator } from '@/contexts/EstimatorContext';
export default function CustomerAttachmentsTab({ customerId }: { customerId: string }) {
  const attachFileRef = useRef<HTMLInputElement>(null);
  const { state, addCustomerAttachment, removeCustomerAttachment } = useEstimator();
  const uploadFile = trpc.uploads.uploadFile.useMutation();
  const customer = state.customers.find(c => c.id === customerId);
  const files = customer?.attachments ?? [];

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []);
    if (attachFileRef.current) attachFileRef.current.value = '';
    for (const file of picked) {
      if (file.size > 16 * 1024 * 1024) { toast.error(`"${file.name}" exceeds 16 MB`); continue; }
      try {
        const base64 = await new Promise<string>((res, rej) => {
          const r = new FileReader();
          r.onload = ev => res(ev.target?.result as string);
          r.onerror = rej;
          r.readAsDataURL(file);
        });
        toast.loading(`Uploading "${file.name}"...`, { id: file.name });
        const result = await uploadFile.mutateAsync({ filename: file.name, mimeType: file.type || 'application/octet-stream', base64, folder: 'customer-attachments' });
        addCustomerAttachment(customerId, { id: nanoid(8), name: file.name, url: result.url, mimeType: file.type, size: file.size, uploadedAt: new Date().toISOString() });
        toast.success(`"${file.name}" uploaded`, { id: file.name });
      } catch { toast.error(`Failed to upload "${file.name}"`, { id: file.name }); }
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Files & Photos</h3>
        <button type="button" onClick={() => attachFileRef.current?.click()}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-semibold hover:bg-primary/90 transition-colors">
          <Plus size={13} /> Upload File
        </button>
        <input ref={attachFileRef} type="file" multiple className="hidden" onChange={handleUpload} />
      </div>
      {files.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground border-2 border-dashed border-border rounded-xl">
          <Paperclip className="w-8 h-8 mx-auto mb-3 opacity-30" />
          <div className="text-base font-semibold mb-1">No Files Yet</div>
          <div className="text-sm">Upload photos, contracts, or any customer documents.</div>
        </div>
      ) : (
        <div className="space-y-2">
          {files.map(f => (
            <div key={f.id} className="rounded-xl border bg-card p-3 flex items-center gap-3">
              <div className="w-10 h-10 rounded border bg-muted flex items-center justify-center shrink-0 overflow-hidden">
                {f.mimeType.startsWith('image/') ? (
                  <img src={f.url} alt={f.name} className="w-full h-full object-cover" />
                ) : (
                  <FileText className="w-4 h-4 text-muted-foreground" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{f.name}</p>
                <p className="text-xs text-muted-foreground">{(f.size / 1024).toFixed(1)} KB · {new Date(f.uploadedAt).toLocaleDateString()}</p>
              </div>
              <a href={f.url} target="_blank" rel="noreferrer" className="shrink-0 text-xs text-primary hover:underline flex items-center gap-1">
                <Download size={12} /> View
              </a>
              <button type="button" onClick={() => removeCustomerAttachment(customerId, f.id)}
                className="shrink-0 text-xs text-destructive hover:underline flex items-center gap-1">
                <Trash2 size={12} /> Remove
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
