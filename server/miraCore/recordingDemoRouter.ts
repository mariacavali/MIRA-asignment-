import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc";
import { getLocalInvitation } from "../localFileStore";
import { completeRecordingDemoConversation, ensureRecordingDemoSeed, isRecordingDemoEnabled, resetRecordingDemo } from "./recordingDemo";

const tokenSchema = z.string().trim().min(32).max(256);

function requireRecordingDemoEnabled() {
  if (!isRecordingDemoEnabled()) throw new TRPCError({ code: "FORBIDDEN", message: "Recording demo mode is not enabled" });
}

// Entirely additive namespace: every procedure here is a no-op/disabled
// unless MIRA_RECORDING_DEMO=true AND MIRA_LOCAL_FILE_STORE=true are both
// set (server/miraCore/recordingDemo.ts, isRecordingDemoEnabled). Never
// touches Stripe, Resend, OpenAI, LangSmith, or Google Calendar, and never
// modifies any procedure in ./router.ts.
export const recordingDemoRouter = router({
  status: publicProcedure.query(() => ({ enabled: isRecordingDemoEnabled() })),

  activate: publicProcedure.mutation(async ({ ctx }) => {
    requireRecordingDemoEnabled();
    const seed = await ensureRecordingDemoSeed();
    if (!seed.user || !seed.invitation) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Could not seed the recording demo" });
    ctx.res.cookie("mira_local_session", seed.user.openId, { httpOnly: true, sameSite: "lax", secure: false, path: "/" });
    return { shootId: seed.shoot.id, invitationToken: seed.invitation.token };
  }),

  completeConversation: publicProcedure.input(z.object({ token: tokenSchema }).strict()).mutation(async ({ input }) => {
    requireRecordingDemoEnabled();
    const state = await getLocalInvitation(input.token);
    if (!state || !state.shoot.recordingDemo) throw new TRPCError({ code: "NOT_FOUND", message: "Recording demo shoot not found" });
    const updated = await completeRecordingDemoConversation(state.shoot.id);
    if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Recording demo shoot not found" });
    return { ok: true as const };
  }),

  resetDemo: publicProcedure.mutation(async () => {
    requireRecordingDemoEnabled();
    const seed = await resetRecordingDemo();
    if (!seed.user || !seed.invitation) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Could not reset the recording demo" });
    return { shootId: seed.shoot.id, invitationToken: seed.invitation.token };
  }),
});
