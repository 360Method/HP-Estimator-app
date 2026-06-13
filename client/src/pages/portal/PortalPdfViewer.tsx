import { useEffect, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Loader2, X } from "lucide-react";

/**
 * Renders a portal document from server-fetched bytes (blob URL). Loading
 * the document host directly in an iframe fails in the field (CSP,
 * Cloudinary's PDF-delivery block, legacy rows stored under an
 * extensionless public_id), so the server fetches the file and any error
 * shows as a readable message instead of a blank frame.
 */
export default function PortalPdfViewer({
  documentId,
  name,
  onClose,
}: {
  documentId: number;
  name: string;
  onClose: () => void;
}) {
  const fileQuery = trpc.portal.getDocumentFile.useQuery(
    { documentId },
    { staleTime: 10 * 60_000, retry: 1, refetchOnWindowFocus: false }
  );
  const blobUrl = useMemo(() => {
    if (!fileQuery.data) return null;
    const bytes = Uint8Array.from(atob(fileQuery.data.base64), (c) => c.charCodeAt(0));
    return URL.createObjectURL(new Blob([bytes], { type: fileQuery.data.mimeType }));
  }, [fileQuery.data]);
  useEffect(() => () => { if (blobUrl) URL.revokeObjectURL(blobUrl); }, [blobUrl]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-2 md:p-6" onClick={onClose}>
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-4xl h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <span className="text-sm font-medium text-gray-800 truncate pr-4">{name}</span>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 shrink-0"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        {fileQuery.isLoading ? (
          <div className="flex-1 flex items-center justify-center gap-2 text-sm text-gray-500">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading the document…
          </div>
        ) : !blobUrl ? (
          <div className="flex-1 px-6 py-10 text-sm text-gray-500">
            <p>This document would not load{fileQuery.error ? `: ${fileQuery.error.message}` : "."}</p>
            <p className="mt-2">Please try again, or reach out and we will resend it.</p>
          </div>
        ) : (
          <iframe src={blobUrl} title={name} className="flex-1 w-full" style={{ border: 0 }} />
        )}
      </div>
    </div>
  );
}
