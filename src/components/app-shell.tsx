"use client";

import { SignOutButton } from "@/features/auth/components/account-controls";
import { t } from "@/i18n";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/icon";
import { cn } from "@/components/ui";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const navigation = [
    {
      href: "/dashboard",
      label: t.pages.dashboard,
      icon: "grid" as const,
      active: pathname === "/dashboard",
    },
    {
      href: "/experiments",
      label: t.pages.experiments,
      icon: "flask" as const,
      active: pathname.startsWith("/experiments"),
    },
  ];
  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-link">
        {t.shell.skip}
      </a>
      <aside className="sidebar">
        <Link href="/dashboard" className="brand" aria-label={t.shell.brandLabel}>
          <span className="brand-symbol">
            <Icon name="flask" />
          </span>
          <span>
            {t.shell.brandMain}
            <span className="brand-subtitle">{t.shell.brandSub}</span>
          </span>
        </Link>
        <div className="workspace-label">{t.shell.workspace}</div>
        <nav aria-label={t.shell.navigation} className="nav-list">
          {navigation.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn("nav-link", item.active && "nav-active")}
              aria-current={item.active ? "page" : undefined}
            >
              <Icon name={item.icon} />
              {item.label}
              {item.active && <span className="nav-dot" />}
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="demo-profile">
            <span className="avatar">{t.shell.initial}</span>
            <span>
              <strong>
                <Link href="/account">{t.auth.account}</Link>
              </strong>
              <small>{t.shell.noAccount}</small>
            </span>
            <SignOutButton compact />
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <span className="topbar-caption">{t.shell.caption}</span>
          <Link href="/account" className="demo-badge" aria-label={t.auth.account}>
            <span />
            {t.common.local}
          </Link>
        </header>
        <main id="main-content" className="main-content">
          {children}
        </main>
      </div>
    </div>
  );
}
