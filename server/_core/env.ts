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
  googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY ?? "",
  // Legacy Forge vars — used by llm.ts, map.ts, notification.ts, voiceTranscription.ts.
  // These services degrade gracefully when not set; set if you have an alternative endpoint.
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
};
