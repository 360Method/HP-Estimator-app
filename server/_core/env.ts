function resolveCookieSecret(): string {
  const secret = process.env.JWT_SECRET ?? "";
  if (process.env.NODE_ENV === "production" && (!secret || secret.length < 32)) {
    throw new Error(
      "[Auth] JWT_SECRET must be set to a strong random string (>=32 chars) in production."
    );
  }
  if (!secret || secret.length < 32) {
    console.warn("[Auth] JWT_SECRET missing or <32 chars — dev only, unsafe for production.");
  }
  return secret;
}

export const ENV = {
  cookieSecret: resolveCookieSecret(),
  databaseUrl: process.env.DATABASE_URL ?? "",
  isProduction: process.env.NODE_ENV === "production",
  cloudinaryCloudName: process.env.CLOUDINARY_CLOUD_NAME ?? "",
  cloudinaryApiKey: process.env.CLOUDINARY_API_KEY ?? "",
  cloudinaryApiSecret: process.env.CLOUDINARY_API_SECRET ?? "",
  stripeSecretKey: process.env.STRIPE_SECRET_KEY ?? "",
  ownerPhone: process.env.OWNER_PHONE ?? "",
  twilioAccountSid: process.env.TWILIO_ACCOUNT_SID ?? "",
  twilioAuthToken: process.env.TWILIO_AUTH_TOKEN ?? "",
  twilioPhoneNumber: process.env.TWILIO_PHONE_NUMBER ?? "",
  qbClientId: process.env.QUICKBOOKS_CLIENT_ID ?? "",
  qbClientSecret: process.env.QUICKBOOKS_CLIENT_SECRET ?? "",
  qbEnvironment: (process.env.QUICKBOOKS_ENVIRONMENT ?? "sandbox") as "sandbox" | "production",
  qbRedirectUri: process.env.QUICKBOOKS_REDIRECT_URI ?? "",
  googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY ?? "",
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
  // Legacy Forge vars — still referenced by non-LLM proxies (map.ts, voiceTranscription.ts,
  // imageGeneration.ts, dataApi.ts). Safe to leave empty; those services degrade gracefully.
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  // ── Google Business Profile ──────────────────────────────────────────────────
  gbpClientId: process.env.GBP_CLIENT_ID ?? "",
  gbpClientSecret: process.env.GBP_CLIENT_SECRET ?? "",
  gbpRedirectUri: process.env.GBP_REDIRECT_URI ?? "",
  // ── Meta (Facebook / Instagram) ─────────────────────────────────────────────
  metaAppId: process.env.META_APP_ID ?? "",
  metaAppSecret: process.env.META_APP_SECRET ?? "",
  metaSystemUserToken: process.env.META_SYSTEM_USER_TOKEN ?? "",
  metaAdAccountId: process.env.META_AD_ACCOUNT_ID ?? "",
  // ── Google Ads ───────────────────────────────────────────────────────────────
  googleAdsDevToken: process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? "",
  googleAdsClientId: process.env.GOOGLE_ADS_CLIENT_ID ?? "",
  googleAdsClientSecret: process.env.GOOGLE_ADS_CLIENT_SECRET ?? "",
  googleAdsCustomerId: process.env.GOOGLE_ADS_CUSTOMER_ID ?? "",
  googleAdsRedirectUri: process.env.GOOGLE_ADS_REDIRECT_URI ?? "",
};
