import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getPhoneSettings, updatePhoneSettings, placeTestCall } from "../phone";

export const phoneRouter = router({
  getSettings: protectedProcedure.query(async () => {
    return getPhoneSettings();
  }),

  updateSettings: protectedProcedure
    .input(
      z.object({
        forwardingMode: z.enum(["forward_to_number", "forward_to_ai", "voicemail"]).optional(),
        forwardingNumber: z.string().optional(),
        aiServiceNumber: z.string().optional(),
        greeting: z.string().optional(),
        callRecording: z.boolean().optional(),
        transcribeVoicemail: z.boolean().optional(),
      })
    )
    .mutation(async ({ input }) => {
      return updatePhoneSettings(input);
    }),

  testCall: protectedProcedure
    .input(z.object({ toNumber: z.string().min(10) }))
    .mutation(async ({ input, ctx }) => {
      // Build callback base URL from the request headers (same pattern as inbound route)
      const req = ctx.req as import("express").Request;
      const forwardedProto = (req.headers["x-forwarded-proto"] as string) || req.protocol;
      const forwardedHost = (req.headers["x-forwarded-host"] as string) || req.get("host") || "localhost";
      const proto = forwardedProto.split(",")[0].trim();
      const host = forwardedHost.split(",")[0].trim();
      const callbackBaseUrl = `${proto}://${host}`;
      const callSid = await placeTestCall(input.toNumber, callbackBaseUrl);
      return { callSid };
    }),
});
