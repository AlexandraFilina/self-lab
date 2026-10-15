import { handleApi, readJson } from "@/server/api";
import { createRequestSchema } from "@/features/experiments/model/api-contracts";
export async function GET(request: Request) {
  return handleApi(request, (repository) => repository.listExperiments());
}
export async function POST(request: Request) {
  return handleApi(request, async (repository) =>
    repository.createExperiment(createRequestSchema.parse(await readJson(request))),
  );
}
