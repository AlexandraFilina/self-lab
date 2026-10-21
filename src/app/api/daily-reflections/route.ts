import { handleApi, readJson } from "@/server/api";
import { saveReflectionSchema } from "@/features/reflections/model/schemas";

export async function GET(request: Request) {
  return handleApi(request, (repository) => repository.listReflections());
}

export async function PUT(request: Request) {
  return handleApi(request, async (repository) =>
    repository.saveReflection(saveReflectionSchema.parse(await readJson(request))),
  );
}
