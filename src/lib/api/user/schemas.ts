import z from 'zod';

const CUSTOM_URL_MAX_LENGTH = 32;

export const identifier = z.string().min(1).max(CUSTOM_URL_MAX_LENGTH).toLowerCase().trim();
