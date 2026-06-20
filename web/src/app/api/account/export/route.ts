/**
 * GET /api/account/export
 * ---------------------------------------------------------------------------
 * KVKK/GDPR "veri taşınabilirliği" hakkı: kullanıcının kendisine ait TÜM
 * verisini makine-okunur (JSON) biçimde döndürür.
 *
 * GÜVENLİK: Yalnızca kimliği doğrulanmış kullanıcı, RLS üzerinden kendi
 * verisine erişir. Başkasının verisi döndürülemez.
 * ---------------------------------------------------------------------------
 */

import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const auth = await authenticateRequest(req.headers.get("authorization"));
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { user, supabase } = auth;

  // RLS sayesinde tüm sorgular yalnızca kendi user_id satırlarını döndürür.
  const [profile, settings, baselines, windows, reports] = await Promise.all([
    supabase.from("users").select("*").eq("id", user.id).maybeSingle(),
    supabase.from("user_settings").select("*").eq("user_id", user.id).maybeSingle(),
    supabase.from("baselines").select("*").eq("user_id", user.id),
    supabase.from("typing_windows").select("*").eq("user_id", user.id),
    supabase.from("analysis_reports").select("*").eq("user_id", user.id),
  ]);

  const payload = {
    exported_at: new Date().toISOString(),
    account: { id: user.id, email: user.email },
    profile: profile.data ?? null,
    settings: settings.data ?? null,
    baselines: baselines.data ?? [],
    typing_windows: windows.data ?? [],
    analysis_reports: reports.data ?? [],
    note:
      "Bu dosya yalnızca anonim yazma ritmi metriklerini içerir. Yazdığınız hiçbir karakter, kelime veya metin burada YOKTUR.",
  };

  return new NextResponse(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="neurospace-verilerim-${new Date()
        .toISOString()
        .slice(0, 10)}.json"`,
    },
  });
}
