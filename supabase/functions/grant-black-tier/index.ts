import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from 'https://esm.sh/@supabase/supabase-js@2/cors'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { token } = await req.json()
    if (!token) return new Response(JSON.stringify({ error: 'Token required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Verify invitation
    const { data: inv } = await supabase
      .from('black_invitations')
      .select('*')
      .eq('token', token)
      .eq('status', 'pending')
      .gt('expires_at', new Date().toISOString())
      .single()

    if (!inv) {
      return new Response(JSON.stringify({ error: 'Invalid or expired invitation' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const userId = inv.invited_user_id
    if (!userId) {
      return new Response(JSON.stringify({ error: 'No user linked to invitation' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Upgrade tier to black
    await supabase
      .from('the_close_user_types')
      .update({ subscription_tier: 'black' })
      .eq('user_id', userId)
      .eq('role', 'closer')

    // Mark invitation accepted
    await supabase
      .from('black_invitations')
      .update({ status: 'accepted', accepted_at: new Date().toISOString() })
      .eq('id', inv.id)

    // Update priority score
    const { data: newScore } = await supabase.rpc('calculate_priority_score', { p_user_id: userId })
    await supabase.from('closer_profiles').update({ priority_score: newScore }).eq('user_id', userId)

    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
