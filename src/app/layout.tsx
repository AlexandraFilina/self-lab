import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { ExperimentsProvider } from "@/features/experiments/context/experiments-provider";
import { APP_NAME, DEMO_DATE } from "@/lib/config";
import { MOCK_EXPERIMENTS } from "@/features/experiments/data/mock-experiments";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: APP_NAME, template: `%s · ${APP_NAME}` },
  description: "Personal experiments: observe, compare, and find your rhythm.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ExperimentsProvider initialExperiments={MOCK_EXPERIMENTS} referenceDate={DEMO_DATE}>
          <AppShell>{children}</AppShell>
        </ExperimentsProvider>
      </body>
    </html>
  );
}
