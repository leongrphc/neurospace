/**
 * Gizlilik Sayfası — kullanıcıya hangi verinin toplanıp toplanmadığını anlatır.
 */

import Link from "next/link";
import { AppShell } from "@/components/AppShell";

const NEVER = [
  "Yazdığınız karakterler, harfler, kelimeler veya cümleler",
  "Input alanlarının içeriği (element.value asla okunmaz)",
  "Ham tuş listesi veya zaman damgası dizileri",
  "Hangi karakterin silindiği bilgisi",
  "Ziyaret ettiğiniz sitelerin adresleri",
];

const ONLY = [
  "İki geçerli tuş arasındaki süre (flight time, ms)",
  "Toplam tuş sayısı (yalnızca sayaç)",
  "Backspace oranı (yalnızca yüzde)",
  "Yazma ritmi ve duraklama oranı",
  "3 dakikalık anonim özet metrikler",
];

export default function PrivacyPage() {
  return (
    <AppShell>
      <div className="mx-auto max-w-2xl">
        <h1 className="mb-2 text-2xl font-bold">Gizlilik</h1>
        <p className="mb-6 text-sm text-slate-500">
          NeuroSpace, ne yazdığınızı değil, nasıl yazdığınızın ritmini ölçer.
        </p>

        <div className="ns-card mb-4 border-l-4 border-l-red-500">
          <h2 className="mb-3 font-semibold text-red-500">Asla toplanmaz</h2>
          <ul className="space-y-2">
            {NEVER.map((item) => (
              <li key={item} className="flex items-start gap-2 text-sm">
                <span className="text-red-500">✕</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="ns-card mb-4 border-l-4 border-l-green-500">
          <h2 className="mb-3 font-semibold text-green-500">Yalnızca bunlar ölçülür</h2>
          <ul className="space-y-2">
            {ONLY.map((item) => (
              <li key={item} className="flex items-start gap-2 text-sm">
                <span className="text-green-500">✓</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="ns-card">
          <h2 className="mb-3 font-semibold">Ek güvenceler</h2>
          <ul className="space-y-2 text-sm text-slate-600 dark:text-slate-300">
            <li>• Şifre, kredi kartı, OTP ve ödeme alanlarında ölçüm tamamen devre dışıdır.</li>
            <li>• Gizli pencerede eklenti varsayılan olarak çalışmaz.</li>
            <li>• Veri yalnızca HTTPS üzerinden gönderilir.</li>
            <li>• Her kullanıcı yalnızca kendi verisini görür (Row Level Security).</li>
            <li>• Takibi istediğiniz an kapatabilir, siteleri hariç tutabilirsiniz.</li>
          </ul>
        </div>

        {/* Tıbbi araç değildir uyarısı */}
        <div className="ns-card mt-4 border-l-4 border-l-amber-500">
          <h2 className="mb-2 font-semibold text-amber-500">Önemli uyarı</h2>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            NeuroSpace bir <strong>tıbbi cihaz veya teşhis aracı değildir</strong>.
            Ürettiği skorlar ve "odak/yorgunluk" sinyalleri yalnızca genel bir
            farkındalık amacı taşır; tıbbi, psikolojik veya mesleki bir
            değerlendirme yerine geçmez. Sağlığınızla ilgili kararlar için bir
            uzmana danışın.
          </p>
        </div>

        {/* KVKK / GDPR Aydınlatma Metni */}
        <div className="ns-card mt-4">
          <h2 className="mb-3 font-semibold">Aydınlatma Metni (KVKK / GDPR)</h2>
          <div className="space-y-3 text-sm text-slate-600 dark:text-slate-300">
            <p>
              <strong>Veri sorumlusu:</strong> NeuroSpace. İşlenen veriler
              yalnızca anonim yazma ritmi metrikleridir (tuşlar arası süre,
              backspace oranı, duraklama oranı gibi 3 dakikalık özetler).
              Yazdığınız içerik işlenmez.
            </p>
            <p>
              <strong>İşleme amacı:</strong> Yazma ritminizdeki değişimlerden
              kişisel odak/yorgunluk farkındalığı sağlamak ve size özet rapor
              sunmak.
            </p>
            <p>
              <strong>Hukuki dayanak:</strong> İşleme tamamen açık rızanıza
              dayanır. Rızanızı istediğiniz an geri çekebilir, takibi
              kapatabilir veya verilerinizi silebilirsiniz.
            </p>
            <p>
              <strong>Saklama:</strong> Veriler Supabase altyapısında, yalnızca
              size ait olacak şekilde (satır düzeyi güvenlik) saklanır. Hesap
              veya veri silme talebinizde kalıcı olarak silinir.
            </p>
            <p>
              <strong>Haklarınız:</strong> Verilerinize erişme, düzeltme, silme
              ve taşıma (dışa aktarma) haklarına sahipsiniz. Bu işlemleri{" "}
              <Link href="/settings" className="text-indigo-500 underline">
                Ayarlar
              </Link>{" "}
              sayfasından kendiniz yapabilirsiniz.
            </p>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
