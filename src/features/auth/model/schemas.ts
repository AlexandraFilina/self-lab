import { z } from "zod";
import { t } from "@/i18n";
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, t.auth.emailInvalid)
  .pipe(z.email(t.auth.emailInvalid));
export const passwordSchema = z
  .string()
  .min(12, t.auth.passwordInvalid)
  .max(128, t.auth.passwordInvalid);
export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, t.auth.passwordRequired).max(128, t.auth.passwordInvalid),
});
export const signUpSchema = z
  .object({ email: emailSchema, password: passwordSchema, confirmPassword: z.string() })
  .refine((value) => value.password === value.confirmPassword, {
    path: ["confirmPassword"],
    message: t.auth.passwordMismatch,
  });
export const resetPasswordSchema = z
  .object({ password: passwordSchema, confirmPassword: z.string() })
  .refine((value) => value.password === value.confirmPassword, {
    path: ["confirmPassword"],
    message: t.auth.passwordMismatch,
  });
