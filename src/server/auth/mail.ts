import "server-only";
import nodemailer from "nodemailer";
export type AuthMail = { to: string; subject: string; text: string };
export type SendAuthMail = (mail: AuthMail) => Promise<void>;
export const sendLocalAuthMail: SendAuthMail = async (mail) => {
  const host = process.env.SMTP_HOST;
  if (!host || !["localhost", "127.0.0.1", "::1"].includes(host))
    throw new Error("Configure the local SMTP transport. Production delivery is not configured.");
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
