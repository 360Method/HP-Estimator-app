import { describe, expect, it } from "vitest";
import { vapiAdapter } from "./adapters/vapi";

describe("vapiAdapter.parse", () => {
  it("normalizes a tool-calls message with object arguments", () => {
    const event = vapiAdapter.parse({
      message: {
        type: "tool-calls",
        toolCallList: [
          { id: "tc_1", function: { name: "check_service_area", arguments: { zip: "98682" } } },
        ],
        call: { type: "inboundPhoneCall", customer: { number: "+13605551234" } },
      },
    });
    expect(event.kind).toBe("tool-calls");
    if (event.kind !== "tool-calls") return;
    expect(event.fromNumber).toBe("+13605551234");
    expect(event.calls[0]).toEqual({
      id: "tc_1",
      name: "check_service_area",
      args: { zip: "98682" },
    });
  });

  it("parses stringified tool arguments", () => {
    const event = vapiAdapter.parse({
      message: {
        type: "tool-calls",
        toolCallList: [{ id: "tc_2", function: { name: "capture_lead", arguments: '{"name":"Jane"}' } }],
      },
    });
    if (event.kind !== "tool-calls") throw new Error("expected tool-calls");
    expect(event.calls[0].args).toEqual({ name: "Jane" });
  });

  it("handles the legacy function-call form", () => {
    const event = vapiAdapter.parse({
      message: {
        type: "function-call",
        functionCall: { name: "lookup_caller", parameters: { phone: "+13605550000" } },
        call: { customer: { number: "+13605550000" } },
      },
    });
    if (event.kind !== "tool-calls") throw new Error("expected tool-calls");
    expect(event.calls[0].name).toBe("lookup_caller");
    expect(event.calls[0].args).toEqual({ phone: "+13605550000" });
  });

  it("normalizes an end-of-call report", () => {
    const event = vapiAdapter.parse({
      message: {
        type: "end-of-call-report",
        endedReason: "customer-ended-call",
        durationSeconds: 92,
        transcript: "AI: Hello. Caller: I need a faucet fixed.",
        summary: "Caller wants a faucet repair.",
        recordingUrl: "https://example.com/rec.mp3",
        call: { id: "call_abc", type: "inboundPhoneCall", customer: { number: "+13605559999" } },
      },
    });
    expect(event.kind).toBe("call-report");
    if (event.kind !== "call-report") return;
    expect(event.report).toMatchObject({
      callId: "call_abc",
      fromNumber: "+13605559999",
      direction: "inbound",
      durationSecs: 92,
      summary: "Caller wants a faucet repair.",
      recordingUrl: "https://example.com/rec.mp3",
    });
  });

  it("ignores unrelated message types", () => {
    const event = vapiAdapter.parse({ message: { type: "speech-update" } });
    expect(event.kind).toBe("ignored");
  });
});

describe("vapiAdapter.formatToolResults", () => {
  it("returns Vapi's results array plus a legacy result field", () => {
    const body = vapiAdapter.formatToolResults([
      { id: "tc_1", result: "Yes, we serve 98682." },
    ]) as { results: Array<{ toolCallId: string; result: string }>; result: string };
    expect(body.results).toEqual([{ toolCallId: "tc_1", result: "Yes, we serve 98682." }]);
    expect(body.result).toBe("Yes, we serve 98682.");
  });
});
