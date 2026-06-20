"use client";

/**
 * Login / Register — Supabase Auth (email + şifre).
 * Supabase yapılandırılmamışsa demo moduna yönlendirir.
 * Giriş sonrası access token, eklenti options sayfasına yapıştırmak için
 * kullanıcıya gösterilir.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getSupabaseBrowser } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const supabase = getSupabaseBrowser();

  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);

    if (!supabase) {
      setMessage(
        "Demo modu: Supabase yapılandırılmadı. Panele yönlendiriliyorsunuz."
      );
      setTimeout(() => router.push("/dashboard"), 1200);
      return;
    }

    setLoading(true);
    try {
      if (mode === "register") {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setMessage(
          "Kayıt başarılı. E-postanızı doğruladıktan sonra giriş yapın."
        );
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        // Eklenti için access token'ı göster
        setToken(data.session?.access_token ?? null);
        setMessage("Giriş başarılı.");
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Bir hata oluştu.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-5">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 h-12 w-12 rounded-xl bg-gradient-to-br from-indigo-500 to-cyan-400" />
          <h1 className="text-2xl font-bold ns-gradient-text">NeuroSpace</h1>
          <p className="mt-1 text-sm text-slate-500">
            Gizlilik odaklı odak analizi
          </p>
        </div>

        <div className="ns-card">
          <div className="mb-5 flex gap-2 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
            {(["login", "register"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`flex-1 rounded-md py-2 text-sm font-medium transition ${
                  mode === m
                    ? "bg-white text-indigo-500 shadow-sm dark:bg-slate-900"
                    : "text-slate-500"
                }`}
              >
                {m === "login" ? "Giriş" : "Kayıt"}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm text-slate-500">
                E-posta
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-transparent px-3 py-2 text-sm dark:border-slate-700"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-500">Şifre</label>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-transparent px-3 py-2 text-sm dark:border-slate-700"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-indigo-500 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-600 disabled:opacity-50"
            >
              {loading ? "..." : mode === "login" ? "Giriş Yap" : "Kayıt Ol"}
            </button>
          </form>

          {message && (
            <p className="mt-4 text-center text-sm text-slate-500">{message}</p>
          )}

          {token && (
            <div className="mt-4 rounded-lg bg-slate-100 p-3 dark:bg-slate-800">
              <p className="mb-1 text-xs font-medium text-slate-500">
                Eklenti erişim anahtarı (Ayarlar sayfasına yapıştırın):
              </p>
              <code className="block max-h-24 overflow-auto break-all text-xs text-indigo-500">
                {token}
              </code>
            </div>
          )}

          <div className="mt-5 text-center">
            <Link
              href="/dashboard"
              className="text-sm text-slate-400 hover:underline"
            >
              Demo paneli gör →
            </Link>
          </div>
        </div>

        <p className="mt-4 text-center text-xs text-slate-400">
          <Link href="/privacy" className="hover:underline">
            Gizlilik ilkelerimiz
          </Link>
        </p>
      </div>
    </div>
  );
}
