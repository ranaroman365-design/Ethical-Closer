import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from 'https://esm.sh/@supabase/supabase-js@2/cors'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { user_id, badge_type, kpi_closes, kpi_revenue, kpi_period, reviewer_note, reviewer_id } = await req.json()

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // 1. Check Silver+ tier
    const { data: userType } = await supabase
      .from('the_close_user_types')
      .select('subscription_tier')
      .eq('user_id', user_id)
      .eq('role', 'closer')
      .single()

    const tierRank: Record<string, number> = { bronze: 1, silver: 2, gold: 3, platinum: 4, black: 5 }
    if (!userType || (tierRank[userType.subscription_tier] ?? 0) < 2) {
      return new Response(JSON.stringify({ error: 'User must be Silver or higher' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // 2. Check no active duplicate
    const { data: existing } = await supabase
      .from('etc_badges')
      .select('id')
      .eq('user_id', user_id)
      .eq('badge_type', badge_type)
      .eq('is_active', true)
      .maybeSingle()

    if (existing) {
      return new Response(JSON.stringify({ error: 'Badge already active' }), { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // 3. Insert badge
    const { data: badge, error } = await supabase
      .from('etc_badges')
      .insert({
        user_id, badge_type, kpi_closes, kpi_revenue, kpi_period,
        verified_by: reviewer_id, verified_at: new Date().toISOString(),
        notes: reviewer_note, is_active: true
      })
      .select()
      .single()

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // 4. Update priority_score
    const { data: newScore } = await supabase.rpc('calculate_priority_score', { p_user_id: user_id })
    await supabase.from('closer_profiles').update({ priority_score: newScore }).eq('user_id', user_id)

    // 5. Approve pending submissions
    await supabase
      .from('kpi_submissions')
      .update({ status: 'approved', reviewed_at: new Date().toISOString(), reviewer_note })
      .eq('user_id', user_id)
      .eq('status', 'submitted')

    return new Response(JSON.stringify({ success: true, badge }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
