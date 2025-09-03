import type z from 'zod';
import { page } from '$app/state';

export function validatedSearchParam<T extends z.ZodType>(schema: T, key: string) {
	const value = page.url.searchParams.get(key);
	const parsed = schema.safeParse(value);
	return parsed.success ? parsed.data : null;
}
