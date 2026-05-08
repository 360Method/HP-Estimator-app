export function getRecordingPlaybackUrl(
  recordingAppUrl?: string | null,
  recordingUrl?: string | null,
): string | null {
  const candidates = [recordingAppUrl, recordingUrl].filter(Boolean) as string[];
  const appHostedUrl = candidates.find((url) => !url.includes("api.twilio.com"));
  if (appHostedUrl) return appHostedUrl;

  for (const url of candidates) {
    const match = url.match(/Recordings\/(RE[0-9a-f]{32})/i) ?? url.match(/(RE[0-9a-f]{32})/i);
    if (match) return `/api/twilio/recording/${match[1]}`;
  }

  return null;
}
