/**
 * AddressMapPreview
 * -----------------
 * Small embedded Google Map showing a pin at a given address.
 * Uses the shared SDK loader (no duplicate script injection).
 * Uses classic google.maps.Marker (NOT AdvancedMarkerElement) for
 * iOS Safari / WebKit compatibility.
 *
 * DOM isolation strategy:
 * - React owns only the outer wrapper div and the overlay divs (loading/error).
 * - The Google Maps SDK owns a dedicated inner div that is created imperatively
 *   via document.createElement and appended/removed outside React's reconciler.
 * - This prevents the "removeChild: node is not a child" error that occurs when
 *   the Maps SDK injects its own child nodes into a div that React also manages.
 */

/// <reference types="@types/google.maps" />

import { useEffect, useRef, useState } from 'react';
import { MapPin, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import { loadMapsSDK } from '@/lib/googleMapsLoader';

interface AddressMapPreviewProps {
  /** Pre-built address string, e.g. "1234 Main St, Vancouver, WA 98683" */
  addressString?: string;
  /** Individual parts — used to build the query if addressString not provided */
  street?: string;
  city?: string;
  state?: string;
  zip?: string;
  /** Pre-geocoded coordinates — skip geocoding if provided */
  lat?: number;
  lng?: number;
  height?: string;
  className?: string;
  /** Show the "Open in Google Maps" link below the map */
  showLink?: boolean;
}

export default function AddressMapPreview({
  addressString,
  street,
  city,
  state,
  zip,
  lat: propLat,
  lng: propLng,
  height = '160px',
  className,
  showLink = true,
}: AddressMapPreviewProps) {
  // React owns this outer wrapper — it never has React-managed children
  const wrapperRef = useRef<HTMLDivElement>(null);
  // The actual map container is created imperatively so Maps SDK owns it fully
  const mapDivRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  // Use classic Marker — AdvancedMarkerElement has known iOS Safari crashes
  const markerRef = useRef<google.maps.Marker | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  // Build the query string
  const query = addressString
    ?? [street, city, state && zip ? `${state} ${zip}` : state ?? zip]
      .filter(Boolean)
      .join(', ');

  const mapsUrl = `https://maps.google.com/?q=${encodeURIComponent(query)}`;

  useEffect(() => {
    if (!query || query.trim().length < 5) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    // Create the map container div imperatively — outside React's reconciler
    const mapDiv = document.createElement('div');
    mapDiv.style.width = '100%';
    mapDiv.style.height = height;
    mapDiv.style.position = 'absolute';
    mapDiv.style.inset = '0';
    mapDivRef.current = mapDiv;

    // Append to wrapper once it's mounted
    if (wrapperRef.current) {
      wrapperRef.current.appendChild(mapDiv);
    }

    async function init() {
      try {
        await loadMapsSDK();
        if (cancelled || !mapDivRef.current) return;

        let lat = propLat;
        let lng = propLng;

        // Geocode if no coordinates provided
        if (lat == null || lng == null) {
          const geocoder = new window.google.maps.Geocoder();
          const result = await new Promise<google.maps.GeocoderResult | null>((resolve) => {
            geocoder.geocode({ address: query }, (results, status) => {
              resolve(status === 'OK' && results ? results[0] : null);
            });
          });
          if (!result || cancelled) {
            if (!cancelled) { setLoading(false); setError(true); }
            return;
          }
          lat = result.geometry.location.lat();
          lng = result.geometry.location.lng();
        }

        if (cancelled || !mapDivRef.current) return;

        const center = { lat: lat!, lng: lng! };

        mapRef.current = new window.google.maps.Map(mapDivRef.current, {
          center,
          zoom: 16,
          // No mapId — required to avoid AdvancedMarker dependency on iOS
          disableDefaultUI: true,
          zoomControl: false,
          gestureHandling: 'cooperative',
          clickableIcons: false,
        });

        // Classic Marker — fully supported on all browsers including iOS Safari
        markerRef.current = new window.google.maps.Marker({
          map: mapRef.current,
          position: center,
          title: query,
        });

        if (!cancelled) setLoading(false);
      } catch (e) {
        console.error('[AddressMapPreview]', e);
        if (!cancelled) { setLoading(false); setError(true); }
      }
    }

    init();

    return () => {
      cancelled = true;
      // Detach marker before removing the div
      if (markerRef.current) {
        markerRef.current.setMap(null);
        markerRef.current = null;
      }
      // Remove the imperatively-created map div from the DOM
      // This happens outside React's reconciler so no removeChild conflict
      if (mapDivRef.current && mapDivRef.current.parentNode) {
        mapDivRef.current.parentNode.removeChild(mapDivRef.current);
      }
      mapDivRef.current = null;
      mapRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, propLat, propLng]);

  if (!query || query.trim().length < 5) return null;

  return (
    <div className={cn('rounded-lg overflow-hidden border border-border', className)}>
      {/* wrapperRef is the stable outer div React owns — no React children inside */}
      <div
        ref={wrapperRef}
        style={{ height, position: 'relative' }}
        className="w-full bg-slate-100"
      >
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-100 z-10 pointer-events-none">
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <MapPin size={20} className="animate-bounce text-primary" />
              <span className="text-xs">Loading map…</span>
            </div>
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-100 z-10 pointer-events-none">
            <div className="flex flex-col items-center gap-1 text-muted-foreground text-center px-4">
              <MapPin size={18} className="opacity-40" />
              <span className="text-xs">Map unavailable</span>
            </div>
          </div>
        )}
      </div>

      {showLink && (
        <div className="px-3 py-2 bg-background border-t border-border">
          <a
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline font-medium"
          >
            <ExternalLink size={11} />
            Open in Google Maps
          </a>
        </div>
      )}
    </div>
  );
}
