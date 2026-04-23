import { trpc } from "@/lib/trpc";
import PortalLayout from "@/components/PortalLayout";
import { Loader2, Images } from "lucide-react";
import { useState } from "react";

export default function PortalGallery() {
  const { data, isLoading } = trpc.portal.getGallery.useQuery();
  const photos = data ?? [];
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <PortalLayout>
      <div className="p-6 max-w-5xl mx-auto">
        <p className="text-xs text-gray-400 mb-1">Customer Portal &rsaquo; Gallery</p>
        <h1 className="text-3xl font-light text-gray-900 mb-6">Gallery</h1>

        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
          </div>
        ) : photos.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <Images className="w-16 h-16 mb-4 text-gray-300" />
            <p className="text-base">No photos yet</p>
            <p className="text-sm text-gray-400 mt-1">Photos from your completed jobs will appear here.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {photos.map((photo) => (
              <div
                key={photo.id}
                className="aspect-square rounded-lg overflow-hidden cursor-pointer hover:opacity-90 transition-opacity bg-gray-100"
                onClick={() => setSelected(photo.imageUrl)}
              >
                <img
                  src={photo.imageUrl}
                  alt={photo.caption ?? "Job photo"}
                  className="w-full h-full object-cover"
                />
              </div>
            ))}
          </div>
        )}

        {/* Lightbox */}
        {selected && (
          <div
            className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
            onClick={() => setSelected(null)}
          >
            <img
              src={selected}
              alt="Full size"
              className="max-w-full max-h-full rounded-lg"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        )}
      </div>
    </PortalLayout>
  );
}
