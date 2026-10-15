import { handleApi } from "@/server/api";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return handleApi(request, async (repository) =>
    repository.getExperiment((await context.params).id),
  );
}
