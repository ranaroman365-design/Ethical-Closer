import { describe, it, expect } from "vitest";
import { funnelSourceForPath, resolveFunnelSource } from "@/lib/funnel-source";

describe("Lead Routing — funnelSourceForPath", () => {
  it("/apply → apply_direct", () => {
    expect(funnelSourceForPath("/apply")).toBe("apply_direct");
    expect(funnelSourceForPath("/apply/step-2")).toBe("apply_direct");
    expect(funnelSourceForPath("/Apply")).toBe("apply_direct");
  });

  it("/qualify → qualify_filter", () => {
    expect(funnelSourceForPath("/qualify")).toBe("qualify_filter");
    expect(funnelSourceForPath("/qualify/intro")).toBe("qualify_filter");
  });

  it("/high-income-skill → high_income_angle", () => {
    expect(funnelSourceForPath("/high-income-skill")).toBe("high_income_angle");
    expect(funnelSourceForPath("/high-income-skill/result")).toBe("high_income_angle");
  });

  it("unknown routes return null", () => {
    expect(funnelSourceForPath("/members")).toBeNull();
    expect(funnelSourceForPath("/")).toBeNull();
    expect(funnelSourceForPath("/login")).toBeNull();
  });
});

describe("Lead Routing — resolveFunnelSource", () => {
  it("explicit source takes priority", () => {
    expect(resolveFunnelSource("qualify_filter")).toBe("qualify_filter");
    expect(resolveFunnelSource("apply_direct")).toBe("apply_direct");
  });

  it("invalid explicit falls back to external_inbound", () => {
    // With no session and no matching path, fallback kicks in
    expect(resolveFunnelSource("bogus_source" as any)).toBe("external_inbound");
  });

  it("null explicit falls back to external_inbound when no session/path", () => {
    expect(resolveFunnelSource(null)).toBe("external_inbound");
  });
});
