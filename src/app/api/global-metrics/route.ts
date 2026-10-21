import { handleApi, readJson } from "@/server/api";
import { globalMetricChangeSchema } from "@/features/reflections/model/schemas";

export async function GET(request: Request) {
  return handleApi(request, (repository) => repository.listGlobalMetrics());
}

export async function PATCH(request: Request) {
  return handleApi(request, async (repository) =>
    repository.changeGlobalMetric(globalMetricChangeSchema.parse(await readJson(request))),
  );
}
