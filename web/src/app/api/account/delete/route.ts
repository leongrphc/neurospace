/**
 * POST /api/account/delete
 * ---------------------------------------------------------------------------
 * KVKK/GDPR "silme / unutulma" hakkı. İki mod:
 *  - mode="data": tüm yazma verisini siler (baselines, windows, reports),
 *    hesap kalır. Kullanıcı sıfırdan başlamış olur.
 *  - mode="account": yukarıdakilere ek olarak profil + ayar satırlarını siler.
 *    (auth.users kaydının tamamen silinmesi service role gerektirir; bu
 *    sürümde kullanıcıya panelden talep yolu gösterilir — aşağıdaki nota bkz.)
 *
 * GÜVENLİK: Yalnızca kimliği doğrulanmış kullanıcı, RLS üzerinden kendi
 * verisini siler. CASCADE yerine açık DELETE kullanılır ki RLS devrede kalsın.
 * ---------------------------------------------------------------------------
 */

import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const auth = await authenticateRequest(req.headers.get("authorization"));
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { user, supabase } = auth;

  let mode = "data";
  try {
    const body = await req.json();
    if (body?.mode === "account") mode = "account";
  } catch {
    // gövde yoksa varsayılan: yalnızca veri sil
  }

  // Sıra önemli: önce raporlar (window'a FK), sonra windows ve baselines.
  const delReports = await supabase
    .from("analysis_reports")
    .delete()
    .eq("user_id", user.id);
  const delWindows = await supabase
    .from("typing_windows")
    .delete()
    .eq("user_id", user.id);
  const delBaselines = await supabase
    .from("baselines")
    .delete()
    .eq("user_id", user.id);

  const firstErr =
    delReports.error || delWindows.error || delBaselines.error;
  if (firstErr) {
    console.error("account delete failed:", firstErr.message);
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }

  if (mode === "account") {
    // Profil + ayarları da temizle (RLS: yalnızca kendi satırı)
    await supabase.from("user_settings").delete().eq("user_id", user.id);
    await supabase.from("users").delete().eq("id", user.id);
  }

  return NextResponse.json(
    {
      ok: true,
      mode,
      message:
        mode === "account"
          ? "Tüm verileriniz ve profiliniz silindi. Auth kaydını tamamen kaldırmak için çıkış yapıp hesabı kapatma talebinde bulunabilirsiniz."
          : "Tüm yazma verileriniz silindi. Hesabınız korundu; sıfırdan kalibrasyona başlayabilirsiniz.",
    },
    { status: 200 }
  );
}
