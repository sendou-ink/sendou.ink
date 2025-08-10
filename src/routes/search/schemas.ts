import { z } from 'zod/v4';

export const searchUsersSchema = z.string().max(100).catch('');
