/**
 * AddressMapPreview
 * -----------------
 * Small embedded Google Map showing a pin at a given address.
 * Loads the Maps SDK lazily (shared with AddressAutocomplete).
 * Falls back gracefully if the SDK fails to load.
 *
 * Props
 *   address  – full address string OR individual parts
 *   lat/lng  – optional pre-geocoded coordinates (skips geocoding)
 *   height   – CSS height string (default "160px")
 *   className – extra wrapper classes
 */

/// <reference types="@types/google.maps" />

import { useEffect, useRef, useState } from 'react';
import { MapPin, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';

const API_KEY = import.meta.env.VITE_FRONTEND_FORGE_API_KEY as string;
const FORGE_BASE_URL =
  (import.meta.env.VITE_FRONTEND_FORGE_API_URL as string) ||
  'https://forge.butterfly-effect.dev';
const MAPS_PROXY_URL = `${FORGE_BASE_URL}/v1/maps/proxy`;

let mapsLoadPromise: Promise<void> | null = null;
function loadMapsSDK(): Promise<void> {
  if (window.google?.maps?.places) return Promise.resolve();
  if (mapsLoadPromise) return mapsLoadPromise;
  mapsLoadPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `${MAPS_PROXY_URL}/maps/api/js?key=${API_KEY}&v=weekly&libraries=marker,places,geocoding,geometry`;
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Google Maps SDK'));
    document.head.appendChild(script);
  });
  return mapsLoadPromise;
}

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
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  // Build the query string
  const query = addressString
    ?? [street, city, state && zip ? `${state} ${zip}` : state ?? zip].filter(Boolean).join(', ');

  const mapsUrl = `https://maps.google.com/?q=${encodeURIComponent(query)}`;

  useEffect(() => {
    if (!query || query.trim().length < 5) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function init() {
      try {
        await loadMapsSDK();
        if (cancelled || !mapContainerRef.current) return;

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
            setLoading(false);
            setError(true);
            return;
          }
          lat = result.geometry.location.lat();
          lng = result.geometry.location.lng();
        }

        if (cancelled || !mapContainerRef.current) return;

        const center = { lat, lng };

        if (!mapRef.current) {
          mapRef.current = new window.google.maps.Map(mapContainerRef.current, {
            center,
            zoom: 16,
            mapId: 'DEMO_MAP_ID',
            disableDefaultUI: true,
            zoomControl: true,
            gestureHandling: 'cooperative',
          });
        } else {
          mapRef.current.setCenter(center);
        }

        // Remove old marker
        if (markerRef.current) {
          markerRef.current.map = null;
        }

        markerRef.current = new window.google.maps.marker.AdvancedMarkerElement({
          map: mapRef.current,
          position: center,
          title: query,
        });

        setLoading(false);
      } catch {
        if (!cancelled) {
          setLoading(false);
          setError(true);
        }
      }
    }

    init();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, propLat, propLng]);

  if (!query || query.trim().length < 5) return null;

  return (
    <div className={cn('rounded-lg overflow-hidden border border-border', className)}>
      <div
        ref={mapContainerRef}
        style={{ height }}
        className="w-full bg-slate-100 relative"
      >
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-100">
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <MapPin size={20} className="animate-bounce text-primary" />
              <span className="text-xs">Loading map…</span>
            </div>
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-100">
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
