import { AppShell } from "@/components/app-shell";
import { ExperimentsProvider } from "@/features/experiments/context/experiments-provider";
export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return (
    <ExperimentsProvider>
      <AppShell>{children}</AppShell>
    </ExperimentsProvider>
  );
}
