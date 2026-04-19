export const ENV = {
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  isProduction: process.env.NODE_ENV === "production",
  cloudinaryCloudName: process.env.CLOUDINARY_CLOUD_NAME ?? "",
  cloudinaryApiKey: process.env.CLOUDINARY_API_KEY ?? "",
  cloudinaryApiSecret: process.env.CLOUDINARY_API_SECRET ?? "",
  stripeSecretKey: process.env.STRIPE_SECRET_KEY ?? "",
  qbClientId: process.env.QUICKBOOKS_CLIENT_ID ?? "",
  qbClientSecret: process.env.QUICKBOOKS_CLIENT_SECRET ?? "",
  qbEnvironment: (process.env.QUICKBOOKS_ENVIRONMENT ?? "sandbox") as "sandbox" | "production",
  googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY ?? "",
  // Legacy Forge vars — used by llm.ts, map.ts, notification.ts, voiceTranscription.ts.
  // These services degrade gracefully when not set; set if you have an alternative endpoint.
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
};
