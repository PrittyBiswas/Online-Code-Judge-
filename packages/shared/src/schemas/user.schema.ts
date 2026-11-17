import { z } from 'zod';

export const updateProfileSchema = z.object({
  fullName: z
    .string()
    .trim()
    .max(100, 'Full name cannot exceed 100 characters')
    .nullable()
    .optional(),
  username: z
    .string()
    .trim()
    .min(3, 'Username must be at least 3 characters')
    .max(30, 'Username must be at most 30 characters')
    .regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain alphanumeric characters and underscores')
    .optional(),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email('Invalid email address')
    .max(255, 'Email cannot exceed 255 characters')
    .optional(),
  phoneNumber: z
    .string()
    .trim()
    .regex(/^[+]?[0-9\s\-().]{7,25}$/, 'Invalid phone number format')
    .or(z.literal(''))
    .nullable()
    .optional(),
  avatarUrl: z.string().trim().url('Invalid avatar URL').or(z.literal('')).nullable().optional(),
  bio: z.string().trim().max(1000, 'Bio cannot exceed 1000 characters').nullable().optional(),
  country: z.string().trim().max(100, 'Country cannot exceed 100 characters').nullable().optional(),
  state: z.string().trim().max(100, 'State cannot exceed 100 characters').nullable().optional(),
  city: z.string().trim().max(100, 'City cannot exceed 100 characters').nullable().optional(),
  education: z
    .string()
    .trim()
    .max(100, 'Education cannot exceed 100 characters')
    .nullable()
    .optional(),
  college: z.string().trim().max(255, 'College cannot exceed 255 characters').nullable().optional(),
  degree: z.string().trim().max(100, 'Degree cannot exceed 100 characters').nullable().optional(),
  skills: z
    .array(z.string().trim().min(1).max(50))
    .max(50, 'Cannot have more than 50 skills')
    .optional(),
  githubUrl: z.string().trim().url('Invalid GitHub URL').or(z.literal('')).nullable().optional(),
  linkedinUrl: z
    .string()
    .trim()
    .url('Invalid LinkedIn URL')
    .or(z.literal(''))
    .nullable()
    .optional(),
  portfolioUrl: z
    .string()
    .trim()
    .url('Invalid portfolio URL')
    .or(z.literal(''))
    .nullable()
    .optional(),
});

export const uploadAvatarSchema = z.object({
  dataUrl: z.string().min(1, 'Avatar image data is required'),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type UploadAvatarInput = z.infer<typeof uploadAvatarSchema>;
