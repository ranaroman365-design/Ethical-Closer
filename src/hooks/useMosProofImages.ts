import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type MosProofAsset = {
  slot_key: string;
  image_url: string;
  storage_path: string;
  alt_text: string | null;
  updated_at: string;
};

export const MOS_PROOFS_QUERY_KEY = ["masterofsales", "proof-assets"] as const;

/**
 * Public registry of admin-uploaded screenshots for the /masterofsales LP.
 * Slot key = the route (e.g. "/members/performance"). Slots without an entry
 * stay in the honest empty state.
 */
export const useMosProofImages = () => {
  return useQuery({
    queryKey: MOS_PROOFS_QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("masterofsales_proof_assets")
        .select("slot_key,image_url,storage_path,alt_text,updated_at");
      if (error) throw error;
      const map = new Map<string, MosProofAsset>();
      for (const row of (data ?? []) as MosProofAsset[]) {
        map.set(row.slot_key, row);
      }
      return map;
    },
    staleTime: 60_000,
    gcTime: 5 * 60_000,
  });
};
