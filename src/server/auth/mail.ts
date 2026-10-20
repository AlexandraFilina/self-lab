import "server-only";
import nodemailer from "nodemailer";
export type AuthMail = { to: string; subject: string; text: string };
export type SendAuthMail = (mail: AuthMail) => Promise<void>;
const loopbackHosts = ["localhost", "127.0.0.1", "::1", "[::1]"];
export function localAuthMailAvailable() {
  if (process.env.VERCEL) return false;
  const baseURL = process.env.BETTER_AUTH_URL;
  if (!baseURL || !process.env.SMTP_HOST) return false;
  try {
    const url = new URL(baseURL);
    return (
      url.protocol === "http:" &&
      loopbackHosts.includes(url.hostname) &&
      loopbackHosts.includes(process.env.SMTP_HOST)
    );
  } catch {
    return false;
  }
}
export const sendLocalAuthMail: SendAuthMail = async (mail) => {
  if (!localAuthMailAvailable()) throw new Error("Local authentication mail is unavailable.");
  const host = process.env.SMTP_HOST;
  const transport = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT ?? 1025),
    secure: false,
    ignoreTLS: true,
    connectionTimeout: 3000,
    greetingTimeout: 3000,
    socketTimeout: 5000,
  });
  await transport.sendMail({ from: "Self Lab <no-reply@self-lab.test>", ...mail });
};
