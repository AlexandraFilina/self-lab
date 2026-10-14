"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/icon";
import { cn } from "@/components/ui";
import { DEMO_DATE } from "@/lib/config";
import { formatDate } from "@/lib/format";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const navigation = [
    {
      href: "/dashboard",
      label: "Dashboard",
      icon: "grid" as const,
      active: pathname === "/dashboard",
    },
    {
      href: "/experiments",
      label: "Experiments",
      icon: "flask" as const,
      active: pathname.startsWith("/experiments"),
    },
  ];
  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <aside className="sidebar">
        <Link href="/dashboard" className="brand" aria-label="Habit Experiments — dashboard">
          <span className="brand-symbol">
            <Icon name="flask" />
          </span>
          <span>
            habit<span className="brand-subtitle">experiments</span>
          </span>
        </Link>
        <div className="workspace-label">PERSONAL WORKSPACE</div>
        <nav aria-label="Main navigation" className="nav-list">
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
          <div className="sidebar-note">
            <span className="icon-tile small">
              <Icon name="leaf" />
            </span>
            <strong>
              Small changes.
              <br />A little more self-discovery.
            </strong>
            <p>
              Your rhythm. Your observations.
              <br />
              Your next step.
            </p>
          </div>
          <div className="demo-profile">
            <span className="avatar">D</span>
            <span>
              <strong>Demo workspace</strong>
              <small>No account needed</small>
            </span>
            <span className="profile-dot" />
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <span className="topbar-caption">A little lab for everyday life</span>
          <span className="demo-badge">
            <span />
            Demo mode
          </span>
        </header>
        <main id="main-content" className="main-content">
          {children}
        </main>
        <footer className="footer">
          <span>Stay curious about yourself.</span>
          <span>
            Demo data · {formatDate(DEMO_DATE, { day: "numeric", month: "long", year: "numeric" })}.
            Changes reset on page reload.
          </span>
        </footer>
      </div>
    </div>
  );
}
