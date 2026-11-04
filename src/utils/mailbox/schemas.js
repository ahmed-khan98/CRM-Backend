import { z } from "zod";

const hostPort = {
  imapHost: z.string().trim().min(1).optional(),
  imapPort: z.number().int().min(1).max(65535).optional(),
  imapSecure: z.boolean().optional(),
  smtpHost: z.string().trim().min(1).optional(),
  smtpPort: z.number().int().min(1).max(65535).optional(),
  smtpSecure: z.boolean().optional(),
};

export const serverDefaultsSchema = z.object({
  domain: z
    .string()
    .trim()
    .min(1)
    .transform((s) => s.toLowerCase()),
  imapHost: z.string().trim().min(1),
  imapPort: z.coerce.number().int().min(1).max(65535).default(993),
  imapSecure: z.boolean().default(true),
  smtpHost: z.string().trim().min(1),
  smtpPort: z.coerce.number().int().min(1).max(65535).default(465),
  smtpSecure: z.boolean().default(true),
});

export const createMailboxSchema = z
  .object({
    brandId: z.string().min(1),
    brandEmailId: z.string().optional().nullable(),
    emailAddress: z
      .string()
      .trim()
      .email()
      .transform((s) => s.toLowerCase()),
    loginUsername: z.string().trim().min(1).optional(),
    displayName: z.string().trim().optional().default(""),
    password: z.string().min(1),
    serverDefaultsId: z.string().min(1).optional(),
    domain: z.string().trim().min(1).optional(),
    ...hostPort,
  })
  .refine((d) => d.serverDefaultsId || d.domain, {
    message: "serverDefaultsId or domain is required",
  });

export const updateMailboxSchema = z.object({
  displayName: z.string().trim().optional(),
  loginUsername: z.string().trim().min(1).optional(),
  password: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
  brandEmailId: z.string().nullable().optional(),
  ...hostPort,
});

export const testConnectionSchema = z.object({
  loginUsername: z.string().trim().min(1),
  password: z.string().min(1).optional(),
  mailboxId: z.string().optional(),
  serverDefaultsId: z.string().optional(),
  domain: z.string().trim().optional(),
  ...hostPort,
});

export const assignUsersSchema = z.object({
  assignments: z
    .array(
      z.object({
        userId: z.string().min(1),
        permission: z.enum(["read", "read_send", "manage"]),
      }),
    )
    .min(1),
});

export const updateAssignmentSchema = z.object({
  permission: z.enum(["read", "read_send", "manage"]),
});

/** Admin creates/updates company email for a specific employee */
export const upsertPersonalMailboxSchema = z
  .object({
    userId: z.string().min(1),
    emailAddress: z
      .string()
      .trim()
      .email()
      .transform((s) => s.toLowerCase()),
    loginUsername: z.string().trim().min(1).optional(),
    displayName: z.string().trim().optional().default(""),
    password: z.string().min(1).optional(),
    serverDefaultsId: z.string().min(1).optional(),
    domain: z.string().trim().min(1).optional(),
    isActive: z.boolean().optional(),
    ...hostPort,
  })
  .refine((d) => d.serverDefaultsId || d.domain, {
    message: "serverDefaultsId or domain is required",
  });
