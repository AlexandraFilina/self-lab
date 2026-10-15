import { handleApi, readJson } from "@/server/api";
import { saveEntryRequestSchema } from "@/features/experiments/model/api-contracts";
export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  return handleApi(request, async (repository) =>
    repository.saveEntry(
      (await context.params).id,
      saveEntryRequestSchema.parse(await readJson(request)),
    ),
  );
}
