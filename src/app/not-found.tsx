import { t } from "@/i18n";
import Link from "next/link";
export default function NotFound() {
  return (
    <div className="empty-state">
      <p className="eyebrow">404</p>
      <h1>{t.pages.missing}</h1>
      <p>{t.pages.missingText}</p>
      <Link href="/dashboard" className="button button-primary">
        {t.pages.backDashboard}
      </Link>
    </div>
  );
}
