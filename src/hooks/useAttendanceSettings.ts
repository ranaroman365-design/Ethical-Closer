import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type AttendanceSettings = {
  id: string; scope: "global" | "operator"; operator_id: string | null;
  smart_attendance_enabled: boolean; test_mode: boolean;
  default_cascade: string[]; allowed_hours_start: number; allowed_hours_end: number;
  allowed_hours_tz: string; voice_confirmation_enabled: boolean;
  twilio_from_number: string | null; twilio_whatsapp_from: string | null;
};

export type AiSetterSettings = {
  id: string; scope: "global" | "operator"; operator_id: string | null;
  ai_setter_enabled: boolean; test_mode: boolean; max_attempts: number;
  call_window_start_hour: number; call_window_end_hour: number; call_window_tz: string;
  voice_provider: "stub" | "twilio_voice" | "vapi" | "retell" | "elevenlabs_twilio";
};

export function useAttendanceSettings(scope: "global" | "operator" = "global", operatorId?: string | null) {
  const [data, setData] = useState<AttendanceSettings | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    let q = supabase.from("attendance_settings").select("*").eq("scope", scope);
    if (scope === "operator" && operatorId) q = q.eq("operator_id", operatorId);
    const { data } = await q.maybeSingle();
    setData((data as any) ?? null);
    setLoading(false);
  };

  useEffect(() => { load(); }, [scope, operatorId]);

  const save = async (patch: Partial<AttendanceSettings>) => {
    if (data) {
      await supabase.from("attendance_settings").update(patch).eq("id", data.id);
    } else if (scope === "operator" && operatorId) {
      await supabase.from("attendance_settings").insert({ scope, operator_id: operatorId, ...patch } as any);
    }
    await load();
  };

  return { data, loading, save, reload: load };
}

export function useAiSetterSettings(scope: "global" | "operator" = "global", operatorId?: string | null) {
  const [data, setData] = useState<AiSetterSettings | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    let q = supabase.from("ai_setter_settings").select("*").eq("scope", scope);
    if (scope === "operator" && operatorId) q = q.eq("operator_id", operatorId);
    const { data } = await q.maybeSingle();
    setData((data as any) ?? null);
    setLoading(false);
  };

  useEffect(() => { load(); }, [scope, operatorId]);

  const save = async (patch: Partial<AiSetterSettings>) => {
    if (data) {
      await supabase.from("ai_setter_settings").update(patch).eq("id", data.id);
    } else if (scope === "operator" && operatorId) {
      await supabase.from("ai_setter_settings").insert({ scope, operator_id: operatorId, ...patch } as any);
    }
    await load();
  };

  return { data, loading, save, reload: load };
}
