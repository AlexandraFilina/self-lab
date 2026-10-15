import { handleApi, readJson } from "@/server/api";
import { lifecycleRequestSchema } from "@/features/experiments/model/api-contracts";
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  return handleApi(request, async (repository) =>
    repository.changeLifecycle(
      (await context.params).id,
      lifecycleRequestSchema.parse(await readJson(request)),
    ),
  );
}
