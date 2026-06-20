/**
 * POST /api/account/consent
 * ---------------------------------------------------------------------------
 * Kullanıcının açık rızasını (KVKK açık rıza / GDPR explicit consent) kanıt
 * olarak kaydeder: rıza durumu, zaman damgası ve gösterilen metin sürümü.
 *
 * GÜVENLİK: Yalnızca kimliği doğrulanmış kullanıcı kendi rıza kaydını
 * günceller (RLS).
 * ---------------------------------------------------------------------------
 */

import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/supabase/server";
import { CONSENT_VERSION } from "@/lib/consent";

export async function POST(req: NextRequest) {
  const auth = await authenticateRequest(req.headers.get("authorization"));
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { user, supabase } = auth;

  let granted = false;
  try {
    const body = await req.json();
    granted = body?.granted === true;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { error } = await supabase.from("user_settings").upsert({
    user_id: user.id,
    consent_given: granted,
    consent_at: granted ? new Date().toISOString() : null,
    consent_version: granted ? CONSENT_VERSION : null,
    updated_at: new Date().toISOString(),
  });

  if (error) {
    console.error("consent upsert failed:", error.message);
    return NextResponse.json({ error: "Storage error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, consentVersion: CONSENT_VERSION });
}

export async function GET(req: NextRequest) {
  const auth = await authenticateRequest(req.headers.get("authorization"));
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { user, supabase } = auth;

  const { data } = await supabase
    .from("user_settings")
    .select("consent_given, consent_at, consent_version")
    .eq("user_id", user.id)
    .maybeSingle();

  return NextResponse.json({
    consentGiven: data?.consent_given === true,
    consentAt: data?.consent_at ?? null,
    consentVersion: data?.consent_version ?? null,
    currentVersion: CONSENT_VERSION,
    needsConsent:
      data?.consent_given !== true || data?.consent_version !== CONSENT_VERSION,
  });
}
