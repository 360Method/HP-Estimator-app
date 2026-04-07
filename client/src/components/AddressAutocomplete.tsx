/**
 * AddressAutocomplete
 * -------------------
 * A drop-in replacement for a plain street-address <input> that wires up
 * Google Places Autocomplete (new PlaceAutocompleteElement API or legacy
 * AutocompleteService fallback).  When the user picks a suggestion the
 * component fires onAddressSelect with the parsed address components so the
 * parent can auto-fill city / state / zip.
 *
 * Props
 *   value          – controlled input value (street line only)
 *   onChange       – called on every keystroke (string)
 *   onAddressSelect – called when user picks a suggestion; receives parsed fields
 *   placeholder    – optional placeholder text
 *   className      – extra classes applied to the outer wrapper
 *   inputClassName – extra classes applied to the <input>
 *   disabled       – pass-through to <input>
 */

/// <reference types="@types/google.maps" />

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  KeyboardEvent,
} from 'react';
import { MapPin, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { loadMapsSDK } from '@/lib/googleMapsLoader';

export interface ParsedAddress {
  street: string;   // e.g. "1234 Main St"
  unit: string;     // e.g. "Apt 2B"
  city: string;
  state: string;    // 2-letter abbreviation
  zip: string;
  country: string;
  lat?: number;
  lng?: number;
}

interface Suggestion {
  placeId: string;
  description: string;
  mainText: string;
  secondaryText: string;
}

interface AddressAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onAddressSelect: (parsed: ParsedAddress) => void;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  disabled?: boolean;
}

// SDK loading is handled by the shared singleton in @/lib/googleMapsLoader

// ── Address component parser ──────────────────────────────────────────────────
function parseComponents(
  components: google.maps.GeocoderAddressComponent[]
): Omit<ParsedAddress, 'street' | 'unit' | 'lat' | 'lng'> & {
  streetNumber: string;
  route: string;
} {
  const get = (type: string) =>
    components.find(c => c.types.includes(type))?.short_name ?? '';
  const getLong = (type: string) =>
    components.find(c => c.types.includes(type))?.long_name ?? '';

  return {
    streetNumber: get('street_number'),
    route: getLong('route'),
    city:
      getLong('locality') ||
      getLong('sublocality') ||
      getLong('administrative_area_level_3'),
    state: get('administrative_area_level_1'),
    zip: get('postal_code'),
    country: get('country'),
  };
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function AddressAutocomplete({
  value,
  onChange,
  onAddressSelect,
  placeholder = '1234 Main St',
  className,
  inputClassName,
  disabled,
}: AddressAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [sdkReady, setSdkReady] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const sessionTokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  const autocompleteServiceRef = useRef<google.maps.places.AutocompleteService | null>(null);
  const geocoderRef = useRef<google.maps.Geocoder | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load SDK once on mount
  useEffect(() => {
    loadMapsSDK()
      .then(() => setSdkReady(true))
      .catch(err => console.error('[AddressAutocomplete]', err));
  }, []);

  // Initialise services once SDK is ready
  useEffect(() => {
    if (!sdkReady) return;
    autocompleteServiceRef.current = new window.google.maps.places.AutocompleteService();
    geocoderRef.current = new window.google.maps.Geocoder();
    sessionTokenRef.current = new window.google.maps.places.AutocompleteSessionToken();
  }, [sdkReady]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const fetchSuggestions = useCallback(
    (input: string) => {
      if (!autocompleteServiceRef.current || input.length < 3) {
        setSuggestions([]);
        setOpen(false);
        return;
      }
      setLoading(true);
      autocompleteServiceRef.current.getPlacePredictions(
        {
          input,
          sessionToken: sessionTokenRef.current ?? undefined,
          componentRestrictions: { country: 'us' },
          // Bias toward Vancouver WA / Portland OR metro
          location: new window.google.maps.LatLng(45.6387, -122.6615),
          radius: 80_000, // 80 km
          types: ['address'],
        },
        (predictions, status) => {
          setLoading(false);
          if (
            status === window.google.maps.places.PlacesServiceStatus.OK &&
            predictions
          ) {
            setSuggestions(
              predictions.map(p => ({
                placeId: p.place_id,
                description: p.description,
                mainText: p.structured_formatting.main_text,
                secondaryText: p.structured_formatting.secondary_text,
              }))
            );
            setOpen(true);
            setActiveIdx(-1);
          } else {
            setSuggestions([]);
            setOpen(false);
          }
        }
      );
    },
    []
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = e.target.value;
      onChange(v);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => fetchSuggestions(v), 250);
    },
    [onChange, fetchSuggestions]
  );

  const selectSuggestion = useCallback(
    (suggestion: Suggestion) => {
      if (!geocoderRef.current) return;
      onChange(suggestion.mainText);
      setOpen(false);
      setSuggestions([]);

      // Refresh session token after selection
      sessionTokenRef.current = new window.google.maps.places.AutocompleteSessionToken();

      geocoderRef.current.geocode(
        { placeId: suggestion.placeId },
        (results, status) => {
          if (status !== 'OK' || !results || results.length === 0) return;
          const result = results[0];
          const parsed = parseComponents(result.address_components);
          const street = [parsed.streetNumber, parsed.route]
            .filter(Boolean)
            .join(' ');
          const lat = result.geometry.location.lat();
          const lng = result.geometry.location.lng();

          // Extract unit from description if present (e.g. "Apt 2B")
          const unitMatch = suggestion.description.match(
            /\b(apt|unit|ste|suite|#)\s*[\w-]+/i
          );
          const unit = unitMatch ? unitMatch[0] : '';

          onAddressSelect({
            street,
            unit,
            city: parsed.city,
            state: parsed.state,
            zip: parsed.zip,
            country: parsed.country,
            lat,
            lng,
          });
        }
      );
    },
    [onChange, onAddressSelect]
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (!open || suggestions.length === 0) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIdx(i => Math.min(i + 1, suggestions.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIdx(i => Math.max(i - 1, 0));
      } else if (e.key === 'Enter' && activeIdx >= 0) {
        e.preventDefault();
        selectSuggestion(suggestions[activeIdx]);
      } else if (e.key === 'Escape') {
        setOpen(false);
      }
    },
    [open, suggestions, activeIdx, selectSuggestion]
  );

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      {/* Input */}
      <div className="relative">
        <MapPin
          size={14}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
        />
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
          placeholder={placeholder}
          disabled={disabled}
          autoComplete="off"
          aria-autocomplete="list"
          aria-expanded={open}
          className={cn('field-input w-full pl-9 pr-8', inputClassName)}
        />
        {loading && (
          <Loader2
            size={13}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground animate-spin"
          />
        )}
      </div>

      {/* Dropdown */}
      {open && suggestions.length > 0 && (
        <ul
          role="listbox"
          className="absolute z-50 mt-1 w-full rounded-lg border border-border bg-popover shadow-lg overflow-hidden"
        >
          {suggestions.map((s, idx) => (
            <li
              key={s.placeId}
              role="option"
              aria-selected={idx === activeIdx}
              onMouseDown={e => {
                e.preventDefault(); // prevent input blur before click fires
                selectSuggestion(s);
              }}
              onMouseEnter={() => setActiveIdx(idx)}
              className={cn(
                'flex items-start gap-2.5 px-3 py-2.5 cursor-pointer text-sm transition-colors',
                idx === activeIdx
                  ? 'bg-accent text-accent-foreground'
                  : 'hover:bg-accent/50'
              )}
            >
              <MapPin size={13} className="mt-0.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0">
                <span className="font-medium">{s.mainText}</span>
                {s.secondaryText && (
                  <span className="text-muted-foreground ml-1">
                    {s.secondaryText}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
