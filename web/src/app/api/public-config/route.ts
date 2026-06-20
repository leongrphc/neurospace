/**
 * GET /api/public-config
 * ---------------------------------------------------------------------------
 * Eklentinin Supabase Auth'a doğrudan giriş yapabilmesi için gereken PUBLIC
 * değerleri döndürür. Bu değerler zaten istemci tarafında açıktır
 * (NEXT_PUBLIC_*), gizli bir bilgi içermez. Service role key ASLA dönmez.
 * ---------------------------------------------------------------------------
 */

import { NextResponse } from "next/server";

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  return NextResponse.json(
    { supabaseUrl: url, supabaseAnonKey: anonKey },
    {
      // Eklenti tarayıcı dışı bağlamdan çağırabilsin diye CORS açık (sadece public veri).
      headers: { "Access-Control-Allow-Origin": "*" },
    }
  );
}
