import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { ExperimentsProvider } from "@/features/experiments/context/experiments-provider";
import { APP_NAME } from "@/lib/config";
import { t } from "@/i18n";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: APP_NAME, template: `%s · ${APP_NAME}` },
  description: t.pages.description,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ExperimentsProvider>
          <AppShell>{children}</AppShell>
        </ExperimentsProvider>
      </body>
    </html>
  );
}
