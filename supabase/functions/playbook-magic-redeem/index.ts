// Public edge function: playbook-magic-redeem
// GET /playbook-magic-redeem?token=<hex>
//   - validates token (one-shot, 24h TTL by default)
//   - issues a 60s signed Storage URL for the resolved playbook PDF
//   - 302-redirects the browser straight to the signed URL
//
// No JWT required (public link from email).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const APP_BASE =
  Deno.env.get("PUBLIC_APP_URL") ?? "https://ethical-closing.lovable.app";

function errorPage(title: string, message: string, status = 400) {
  const html = `<!doctype html>
<html lang="de"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${title}</title>
<style>
 body{margin:0;font-family:-apple-system,Inter,Helvetica,Arial,sans-serif;background:#fff;color:#1A1A1A;}
 .wrap{max-width:480px;margin:80px auto;padding:40px 28px;background:#FBFAF7;border:1px solid #ECE8E0;border-radius:4px;}
 h1{font-family:"Cormorant Garamond",Georgia,serif;font-weight:400;font-size:26px;margin:0 0 16px;}
 p{font-size:15px;line-height:1.7;color:#4A4A4A;margin:0 0 12px;}
 a{display:inline-block;margin-top:18px;background:#1A1A1A;color:#fff;text-decoration:none;padding:12px 22px;border-radius:2px;font-size:14px;letter-spacing:.04em;}
 .meta{margin-top:28px;font-size:12px;color:#8C8C8C;}
</style></head>
<body><div class="wrap">
 <h1>${title}</h1>
 <p>${message}</p>
 <a href="${APP_BASE}/members/playbooks/auszahlungspolitik">Zum Playbook im Mitgliederbereich</a>
 <p class="meta">Du musst eingeloggt sein, um das Dokument im Mitgliederbereich zu öffnen.</p>
</div></body></html>`;
  return new Response(html, {
    status,
    headers: { ...cors, "Content-Type": "text/html; charset=utf-8" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const url = new URL(req.url);
  const token = (url.searchParams.get("token") ?? "").trim();
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const ua = req.headers.get("user-agent") ?? null;

  if (!token || token.length < 16) {
    return errorPage("Ungültiger Link", "Dieser Download-Link ist nicht gültig.", 400);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  // Redeem (atomic, marks as used)
  const { data: redeemed, error: redeemErr } = await admin.rpc(
    "redeem_playbook_magic_token",
    { _token: token, _ip: ip, _user_agent: ua },
  );

  if (redeemErr || !redeemed || (Array.isArray(redeemed) && redeemed.length === 0)) {
    const code = String(redeemErr?.message ?? "");
    if (code.includes("token_used")) {
      return errorPage(
        "Link bereits verwendet",
        'Dieser Download-Link wurde bereits eingelöst. Du findest die Auszahlungspolitik jederzeit im Mitgliederbereich unter „Playbooks".',
        410,
      );
    }
    if (code.includes("token_expired")) {
      return errorPage(
        "Link abgelaufen",
        "Dieser Download-Link ist abgelaufen. Öffne die Auszahlungspolitik im Mitgliederbereich.",
        410,
      );
    }
    return errorPage(
      "Link nicht gültig",
      "Dieser Download-Link konnte nicht eingelöst werden.",
      400,
    );
  }

  const row = Array.isArray(redeemed) ? redeemed[0] : redeemed;
  const fileName: string = row.resolved_file_name;

  const { data: signed, error: signErr } = await admin.storage
    .from("playbooks")
    .createSignedUrl(fileName, 60, { download: fileName });

  if (signErr || !signed?.signedUrl) {
    return errorPage(
      "Datei nicht verfügbar",
      "Die Datei konnte gerade nicht ausgeliefert werden. Bitte über den Mitgliederbereich öffnen.",
      500,
    );
  }

  return new Response(null, {
    status: 302,
    headers: { ...cors, Location: signed.signedUrl, "Cache-Control": "no-store" },
  });
});
