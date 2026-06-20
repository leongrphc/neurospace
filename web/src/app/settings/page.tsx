"use client";

/**
 * Settings — takip tercihi, takip dışı siteler ve hesap.
 * Supabase varsa user_settings tablosuna yazar; yoksa yalnızca yerel demo.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { getSupabaseBrowser } from "@/lib/supabase/client";

function Toggle({
  label,
  desc,
  value,
  onChange,
}: {
  label: string;
  desc: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-slate-200/70 py-5 last:border-0 dark:border-white/10">
      <div className="pr-4">
        <div className="font-bold text-slate-950 dark:text-white">{label}</div>
        <div className="mt-1 text-sm leading-5 text-slate-500 dark:text-slate-400">
          {desc}
        </div>
      </div>
      <button
        type="button"
        onClick={() => onChange(!value)}
        className={`ns-focus-ring relative h-8 w-14 flex-shrink-0 rounded-full p-1 transition ${
          value
            ? "bg-slate-950 shadow-lg shadow-slate-950/15 dark:bg-cyan-300"
            : "bg-slate-300 dark:bg-slate-700"
        }`}
        aria-pressed={value}
        aria-label={`${label}: ${value ? "açık" : "kapalı"}`}
      >
        <span
          className={`block h-6 w-6 rounded-full bg-white shadow-sm transition dark:bg-slate-950 ${
            value ? "translate-x-6" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  );
}

export default function SettingsPage() {
  const supabase = getSupabaseBrowser();
  const [trackingEnabled, setTrackingEnabled] = useState(true);
  const [incognitoEnabled, setIncognitoEnabled] = useState(false);
  const [saved, setSaved] = useState(false);
  const [demo, setDemo] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [dataMsg, setDataMsg] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      if (!supabase) return;
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) return;
      const { data } = await supabase
        .from("user_settings")
        .select("tracking_enabled, incognito_enabled")
        .maybeSingle();
      if (data) {
        setTrackingEnabled(data.tracking_enabled);
        setIncognitoEnabled(data.incognito_enabled);
        setDemo(false);
      }
    }
    load().catch(() => {});
  }, [supabase]);

  async function getToken(): Promise<string | null> {
    if (!supabase) return null;
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  }

  async function exportData() {
    const token = await getToken();
    if (!token) {
      setDataMsg("Bu işlem için giriş yapmanız gerekir.");
      return;
    }
    setBusy("export");
    setDataMsg(null);
    try {
      const res = await fetch("/api/account/export", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `neurospace-verilerim-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setDataMsg("Verileriniz indirildi.");
    } catch {
      setDataMsg("İndirme sırasında hata oluştu.");
    } finally {
      setBusy(null);
    }
  }

  async function deleteData(mode: "data" | "account") {
    const token = await getToken();
    if (!token) {
      setDataMsg("Bu işlem için giriş yapmanız gerekir.");
      return;
    }
    const confirmMsg =
      mode === "account"
        ? "Tüm verileriniz VE profiliniz kalıcı olarak silinecek. Emin misiniz?"
        : "Tüm yazma verileriniz kalıcı olarak silinecek (hesap kalır). Emin misiniz?";
    if (!confirm(confirmMsg)) return;

    setBusy(mode);
    setDataMsg(null);
    try {
      const res = await fetch("/api/account/delete", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ mode }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error();
      setDataMsg(json.message || "Silme işlemi tamamlandı.");
    } catch {
      setDataMsg("Silme sırasında hata oluştu.");
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    if (supabase && !demo) {
      const { data: session } = await supabase.auth.getSession();
      const uid = session.session?.user.id;
      if (uid) {
        await supabase.from("user_settings").upsert({
          user_id: uid,
          tracking_enabled: trackingEnabled,
          incognito_enabled: incognitoEnabled,
          updated_at: new Date().toISOString(),
        });
      }
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="ns-kicker">Güven merkezi</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950 dark:text-white sm:text-4xl">
              Ayarlar
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300">
              Takip tercihleri, veri taşınabilirliği ve silme hakları tek yerde.
            </p>
          </div>
          {demo && (
            <span className="rounded-full bg-amber-500/10 px-3 py-1.5 text-xs font-bold text-amber-700 dark:text-amber-200">
              Demo modu
            </span>
          )}
        </div>

        <section className="ns-hero-card">
          <div className="relative grid gap-5 md:grid-cols-[0.9fr_1.1fr] md:items-center">
            <div>
              <p className="text-sm font-bold text-slate-500 dark:text-slate-400">
                Gizlilik varsayılanı
              </p>
              <h2 className="mt-2 text-3xl font-black tracking-tight text-slate-950 dark:text-white">
                Kontrol sende, içerik sistemin dışında.
              </h2>
              <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
                NeuroSpace yalnızca anonim ritim özetleriyle çalışır.
                Dilediğinde ölçümü kapatabilir, verilerini indirebilir veya
                silebilirsin.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="ns-panel-muted">
                <b>Metin</b>
                <br />
                <span className="text-xs text-slate-500">asla saklanmaz</span>
              </div>
              <div className="ns-panel-muted">
                <b>Ritim</b>
                <br />
                <span className="text-xs text-slate-500">anonim özetlenir</span>
              </div>
              <div className="ns-panel-muted">
                <b>Haklar</b>
                <br />
                <span className="text-xs text-slate-500">indir / sil</span>
              </div>
            </div>
          </div>
        </section>

        <section className="ns-card">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-black tracking-tight text-slate-950 dark:text-white">
                Takip tercihleri
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Ölçümün ne zaman aktif olacağını belirle.
              </p>
            </div>
          </div>

          <Toggle
            label="Takip aktif"
            desc="Kapatıldığında hiçbir ölçüm yapılmaz ve eklenti özet göndermez."
            value={trackingEnabled}
            onChange={setTrackingEnabled}
          />
          <Toggle
            label="Gizli pencerede takip"
            desc="Gizli (incognito) pencerelerde ölçüm. Varsayılan olarak kapalı tutulur."
            value={incognitoEnabled}
            onChange={setIncognitoEnabled}
          />

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button onClick={save} className="ns-button-primary">
              Kaydet
            </button>
            {saved && (
              <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-300">
                Kaydedildi ✓
              </span>
            )}
          </div>

          <p className="mt-4 text-xs leading-5 text-slate-500">
            Site bazlı takip dışı bırakma, tarayıcı eklentisinin{" "}
            <strong>Ayarlar</strong> sayfasından yapılır.
          </p>
        </section>

        <section className="ns-card">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-black tracking-tight text-slate-950 dark:text-white">
                Verilerim
              </h2>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400">
                Verileriniz yalnızca anonim yazma ritmi metriklerinden oluşur.
                Bu bölüm KVKK/GDPR veri taşınabilirliği ve silme hakları için
                tasarlandı.
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-3 lg:grid-cols-3">
            <button
              onClick={exportData}
              disabled={busy !== null || demo}
              className="ns-button-secondary justify-start text-left"
            >
              <span>
                <span className="block">
                  {busy === "export" ? "İndiriliyor..." : "Verilerimi indir"}
                </span>
                <span className="block text-xs font-normal opacity-70">
                  JSON formatında dışa aktar
                </span>
              </span>
            </button>
            <button
              onClick={() => deleteData("data")}
              disabled={busy !== null || demo}
              className="inline-flex items-center justify-start rounded-2xl border border-amber-300/80 bg-amber-50/70 px-5 py-3 text-left text-sm font-semibold text-amber-800 transition hover:-translate-y-0.5 hover:bg-amber-100 disabled:pointer-events-none disabled:opacity-50 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200"
            >
              <span>
                <span className="block">
                  {busy === "data" ? "Siliniyor..." : "Yazma verilerimi sil"}
                </span>
                <span className="block text-xs font-normal opacity-75">
                  Hesap kalır, ölçümler silinir
                </span>
              </span>
            </button>
            <button
              onClick={() => deleteData("account")}
              disabled={busy !== null || demo}
              className="inline-flex items-center justify-start rounded-2xl border border-rose-300/80 bg-rose-50/70 px-5 py-3 text-left text-sm font-semibold text-rose-800 transition hover:-translate-y-0.5 hover:bg-rose-100 disabled:pointer-events-none disabled:opacity-50 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-200"
            >
              <span>
                <span className="block">
                  {busy === "account" ? "Siliniyor..." : "Profil + tüm veriler"}
                </span>
                <span className="block text-xs font-normal opacity-75">
                  Kalıcı hesap silme
                </span>
              </span>
            </button>
          </div>

          {demo && (
            <p className="mt-4 rounded-2xl bg-amber-500/10 px-4 py-3 text-xs leading-5 text-amber-700 dark:text-amber-200">
              Veri işlemleri için{" "}
              <Link href="/login" className="font-bold underline">
                giriş
              </Link>{" "}
              yapmanız gerekir.
            </p>
          )}
          {dataMsg && (
            <p className="mt-4 rounded-2xl bg-slate-500/10 px-4 py-3 text-sm text-slate-700 dark:text-slate-200">
              {dataMsg}
            </p>
          )}
        </section>

        <p className="text-center text-xs text-slate-400">
          <Link href="/privacy" className="font-semibold hover:underline">
            Gizlilik ve aydınlatma metni
          </Link>
        </p>
      </div>
    </AppShell>
  );
}
