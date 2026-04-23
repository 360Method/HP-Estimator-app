/**
 * googleMapsLoader.ts
 * -------------------
 * Single shared loader for the Google Maps JS SDK.
 * Prevents double-injection (which crashes Safari/WebKit) by:
 *   1. Storing one promise on globalThis so all modules share it.
 *   2. Checking for an existing <script id="google-maps-sdk"> before appending.
 *   3. Resolving only after window.google.maps is confirmed ready.
 */

/// <reference types="@types/google.maps" />

// The Maps JS SDK is served via our own Express proxy at /api/maps/sdk
// which adds the required Authorization: Bearer header that <script> tags cannot send.
const MAPS_SDK_URL = '/api/maps/sdk';

// Use globalThis so the promise survives HMR module re-evaluation
declare global {
  interface Window {
    __mapsLoadPromise?: Promise<void>;
  }
}

export function loadMapsSDK(): Promise<void> {
  // Already fully loaded
  if (window.google?.maps?.places) return Promise.resolve();

  // Return in-flight promise if one exists
  if (window.__mapsLoadPromise) return window.__mapsLoadPromise;

  // Guard: don't inject a second script tag
  const existingScript = document.getElementById('google-maps-sdk');

  window.__mapsLoadPromise = new Promise<void>((resolve, reject) => {
    if (existingScript) {
      // Script already in DOM — poll until google.maps is ready
      const poll = setInterval(() => {
        if (window.google?.maps?.places) {
          clearInterval(poll);
          resolve();
        }
      }, 50);
      // Timeout after 10 s
      setTimeout(() => {
        clearInterval(poll);
        if (!window.google?.maps?.places) reject(new Error('Google Maps SDK timed out'));
      }, 10_000);
      return;
    }

    const script = document.createElement('script');
    script.id = 'google-maps-sdk';
    // NOTE: Do NOT include 'marker' library — AdvancedMarkerElement has known
    // instability on iOS Safari WebKit. We use classic Marker instead.
    script.src = `${MAPS_SDK_URL}?v=weekly&libraries=places,geocoding,geometry`;
    script.async = true;
    script.defer = true;
    // crossOrigin omitted intentionally — Safari is stricter about CORS on
    // script tags and the Maps proxy does not require it.
    script.onload = () => {
      // Poll briefly to ensure google.maps is fully initialised
      const poll = setInterval(() => {
        if (window.google?.maps?.places) {
          clearInterval(poll);
          resolve();
        }
      }, 20);
      setTimeout(() => {
        clearInterval(poll);
        if (!window.google?.maps?.places) reject(new Error('Google Maps SDK load timeout'));
      }, 10_000);
    };
    script.onerror = () => {
      window.__mapsLoadPromise = undefined; // allow retry
      reject(new Error('Failed to load Google Maps SDK'));
    };
    document.head.appendChild(script);
  });

  return window.__mapsLoadPromise;
}
