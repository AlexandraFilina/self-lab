import { handleApi, readJson } from "@/server/api";
import { importRequestSchema } from "@/features/experiments/model/api-contracts";
export async function POST(request: Request) {
  return handleApi(request, async (repository) =>
    repository.importExperiments(importRequestSchema.parse(await readJson(request)).experiments),
  );
}
