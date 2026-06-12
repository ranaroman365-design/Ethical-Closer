import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { canDragAppointment } from "@/hooks/useCalendarDragDrop";

// ── Unit tests for canDragAppointment (no Supabase needed) ──

describe("canDragAppointment – terminal status guard", () => {
  const blocked = ["cancelled", "completed", "no_show", "rescheduled", "closed_won", "closed_lost"];
  const allowed = ["confirmed", "booked", "scheduled", "pending", ""];

  blocked.forEach((s) =>
    it(`blocks "${s}"`, () => expect(canDragAppointment(s)).toBe(false))
  );

  allowed.forEach((s) =>
    it(`allows "${s}"`, () => expect(canDragAppointment(s)).toBe(true))
  );

  it("allows null status", () => expect(canDragAppointment(null)).toBe(true));

  it("is case-insensitive for blocked statuses", () => {
    expect(canDragAppointment("Cancelled")).toBe(false);
    expect(canDragAppointment("NO_SHOW")).toBe(false);
    expect(canDragAppointment("Completed")).toBe(false);
  });
});

// ── Integration-style tests using mocked Supabase ──

// Mock supabase before importing the hook
const mockRpc = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...args: any[]) => mockRpc(...args),
  },
}));

// Mock sonner toast
const mockToastError = vi.fn();
const mockToastSuccess = vi.fn();
vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), {
    error: (...args: any[]) => mockToastError(...args),
    success: (...args: any[]) => mockToastSuccess(...args),
  }),
}));

// Now import the hook (after mocks are set up)
import { useCalendarDragDrop, type DragData, type DropTarget } from "@/hooks/useCalendarDragDrop";

function makeDragData(overrides: Partial<DragData> = {}): DragData {
  return {
    appointmentId: "apt-1",
    startsAt: new Date(Date.now() + 86400000).toISOString(), // tomorrow
    endsAt: new Date(Date.now() + 86400000 + 3600000).toISOString(), // +1h
    leadId: "lead-1",
    leadName: "Max Muster",
    currentOwnerId: "owner-1",
    appointmentStatus: "booked",
    ...overrides,
  };
}

function futureTarget(addDays = 2): DropTarget {
  const d = new Date(Date.now() + addDays * 86400000);
  return {
    date: d.toISOString().slice(0, 10),
    hour: 14,
    minute: 0,
  };
}

function makeDragEvent(data: DragData): Partial<React.DragEvent> {
  const store: Record<string, string> = {};
  return {
    preventDefault: vi.fn(),
    currentTarget: document.createElement("div"),
    dataTransfer: {
      effectAllowed: "move",
      dropEffect: "move",
      setData: (k: string, v: string) => { store[k] = v; },
      getData: (k: string) => store[k] || "",
    } as any,
  };
}

describe("useCalendarDragDrop – edge cases", () => {
  const onSuccess = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockRpc.mockReset();
  });

  it("handleDrop rejects appointment without leadId", () => {
    const { result } = renderHook(() => useCalendarDragDrop(onSuccess));
    const data = makeDragData({ leadId: null });

    // Simulate drag start to populate dataTransfer
    const evt = makeDragEvent(data);
    act(() => {
      result.current.handleDragStart(evt as any, data);
    });

    // Simulate drop
    const dropEvt = {
      preventDefault: vi.fn(),
      dataTransfer: {
        getData: () => JSON.stringify(data),
      },
    } as any;

    act(() => {
      result.current.handleDrop(dropEvt, futureTarget());
    });

    expect(result.current.pendingDrop).toBeNull();
    expect(mockToastError).toHaveBeenCalledWith(
      "Verschieben nicht möglich",
      expect.objectContaining({ description: expect.any(String) })
    );
  });

  it("handleDrop skips when dropped on same time slot", () => {
    const { result } = renderHook(() => useCalendarDragDrop(onSuccess));
    const startsAt = new Date(Date.now() + 2 * 86400000);
    startsAt.setHours(14, 0, 0, 0);
    const data = makeDragData({
      startsAt: startsAt.toISOString(),
      endsAt: new Date(startsAt.getTime() + 3600000).toISOString(),
    });

    const target: DropTarget = {
      date: startsAt.toISOString().slice(0, 10),
      hour: 14,
      minute: 0,
    };

    const dropEvt = {
      preventDefault: vi.fn(),
      dataTransfer: { getData: () => JSON.stringify(data) },
    } as any;

    act(() => {
      result.current.handleDrop(dropEvt, target);
    });

    // Should not stage a pending drop
    expect(result.current.pendingDrop).toBeNull();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("handleDrop rejects past time targets", () => {
    const { result } = renderHook(() => useCalendarDragDrop(onSuccess));
    const data = makeDragData();

    const pastTarget: DropTarget = {
      date: "2020-01-01",
      hour: 10,
      minute: 0,
    };

    const dropEvt = {
      preventDefault: vi.fn(),
      dataTransfer: { getData: () => JSON.stringify(data) },
    } as any;

    act(() => {
      result.current.handleDrop(dropEvt, pastTarget);
    });

    expect(result.current.pendingDrop).toBeNull();
    expect(mockToastError).toHaveBeenCalledWith(
      "Ungültige Zeit",
      expect.objectContaining({ description: expect.any(String) })
    );
  });

  it("confirmDrop handles RPC network error gracefully", async () => {
    mockRpc.mockRejectedValueOnce(new Error("Network timeout"));

    const { result } = renderHook(() => useCalendarDragDrop(onSuccess));
    const data = makeDragData();
    const target = futureTarget();

    const dropEvt = {
      preventDefault: vi.fn(),
      dataTransfer: { getData: () => JSON.stringify(data) },
    } as any;

    act(() => {
      result.current.handleDrop(dropEvt, target);
    });

    expect(result.current.pendingDrop).not.toBeNull();

    await act(async () => {
      await result.current.confirmDrop();
    });

    expect(mockToastError).toHaveBeenCalledWith(
      "Fehler",
      expect.objectContaining({ description: expect.any(String) })
    );
    expect(onSuccess).not.toHaveBeenCalled();
    expect(result.current.processing).toBe(false);
  });

  it("confirmDrop handles RPC returning success=false", async () => {
    mockRpc.mockResolvedValueOnce({
      data: { success: false, error: "Appointment already cancelled" },
      error: null,
    });

    const { result } = renderHook(() => useCalendarDragDrop(onSuccess));
    const data = makeDragData();

    const dropEvt = {
      preventDefault: vi.fn(),
      dataTransfer: { getData: () => JSON.stringify(data) },
    } as any;

    act(() => {
      result.current.handleDrop(dropEvt, futureTarget());
    });

    await act(async () => {
      await result.current.confirmDrop();
    });

    expect(mockToastError).toHaveBeenCalledWith(
      "Verschieben abgelehnt",
      expect.objectContaining({ description: expect.any(String) })
    );
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("confirmDrop handles Supabase error object", async () => {
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { message: "RLS violation" },
    });

    const { result } = renderHook(() => useCalendarDragDrop(onSuccess));
    const data = makeDragData();

    const dropEvt = {
      preventDefault: vi.fn(),
      dataTransfer: { getData: () => JSON.stringify(data) },
    } as any;

    act(() => {
      result.current.handleDrop(dropEvt, futureTarget());
    });

    await act(async () => {
      await result.current.confirmDrop();
    });

    expect(mockToastError).toHaveBeenCalledWith(
      "Verschieben fehlgeschlagen",
      expect.objectContaining({ description: expect.any(String) })
    );
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("confirmDrop succeeds and calls onSuccess", async () => {
    mockRpc.mockResolvedValueOnce({
      data: { success: true, new_id: "apt-2" },
      error: null,
    });

    const { result } = renderHook(() => useCalendarDragDrop(onSuccess));
    const data = makeDragData();

    const dropEvt = {
      preventDefault: vi.fn(),
      dataTransfer: { getData: () => JSON.stringify(data) },
    } as any;

    act(() => {
      result.current.handleDrop(dropEvt, futureTarget());
    });

    await act(async () => {
      await result.current.confirmDrop();
    });

    expect(onSuccess).toHaveBeenCalledOnce();
    expect(result.current.processing).toBe(false);
    expect(result.current.pendingDrop).toBeNull();
  });

  it("cancelDrop clears pending without calling RPC", () => {
    const { result } = renderHook(() => useCalendarDragDrop(onSuccess));
    const data = makeDragData();

    const dropEvt = {
      preventDefault: vi.fn(),
      dataTransfer: { getData: () => JSON.stringify(data) },
    } as any;

    act(() => {
      result.current.handleDrop(dropEvt, futureTarget());
    });

    expect(result.current.pendingDrop).not.toBeNull();

    act(() => {
      result.current.cancelDrop();
    });

    expect(result.current.pendingDrop).toBeNull();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("rapid double-drop: second drop replaces first pending (no double RPC)", async () => {
    const { result } = renderHook(() => useCalendarDragDrop(onSuccess));
    const data = makeDragData();

    const dropEvt1 = {
      preventDefault: vi.fn(),
      dataTransfer: { getData: () => JSON.stringify(data) },
    } as any;

    const dropEvt2 = {
      preventDefault: vi.fn(),
      dataTransfer: { getData: () => JSON.stringify(data) },
    } as any;

    act(() => {
      result.current.handleDrop(dropEvt1, futureTarget(3));
    });

    act(() => {
      result.current.handleDrop(dropEvt2, futureTarget(4));
    });

    // Only the last pending drop should be active
    expect(result.current.pendingDrop?.target).toEqual(futureTarget(4));

    // Confirm → only one RPC call
    mockRpc.mockResolvedValueOnce({ data: { success: true }, error: null });

    await act(async () => {
      await result.current.confirmDrop();
    });

    expect(mockRpc).toHaveBeenCalledTimes(1);
  });

  it("confirmDrop is no-op when pendingDrop is null", async () => {
    const { result } = renderHook(() => useCalendarDragDrop(onSuccess));

    await act(async () => {
      await result.current.confirmDrop();
    });

    expect(mockRpc).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("handleDrop ignores malformed JSON in dataTransfer", () => {
    const { result } = renderHook(() => useCalendarDragDrop(onSuccess));

    const dropEvt = {
      preventDefault: vi.fn(),
      dataTransfer: { getData: () => "not-json{{" },
    } as any;

    act(() => {
      result.current.handleDrop(dropEvt, futureTarget());
    });

    expect(result.current.pendingDrop).toBeNull();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("handleDrop ignores empty dataTransfer", () => {
    const { result } = renderHook(() => useCalendarDragDrop(onSuccess));

    const dropEvt = {
      preventDefault: vi.fn(),
      dataTransfer: { getData: () => "" },
    } as any;

    act(() => {
      result.current.handleDrop(dropEvt, futureTarget());
    });

    expect(result.current.pendingDrop).toBeNull();
  });
});
