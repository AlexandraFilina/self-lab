import { z } from "zod";
export async function latestMailLink(email: string, subject: string) {
  const base = process.env.SELF_LAB_MAILPIT_URL ?? "http://127.0.0.1:8025";
  const url = new URL(base);
  if (!["127.0.0.1", "localhost"].includes(url.hostname))
    throw new Error("Browser tests require local Mailpit.");
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    const result = z
      .object({ messages: z.array(z.object({ ID: z.string(), Subject: z.string() })) })
      .parse(
        await (
          await fetch(base + "/api/v1/search?query=" + encodeURIComponent("to:" + email))
        ).json(),
      );
    const message = result.messages.find((item) => item.Subject.includes(subject));
    if (message) {
      const data = z
        .object({ Text: z.string() })
        .parse(
          await (await fetch(base + "/api/v1/message/" + encodeURIComponent(message.ID))).json(),
        );
      const link = data.Text.match(/http[^\s]+/)?.[0];
      if (link) return link;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Mailpit did not receive the expected test message.");
}
