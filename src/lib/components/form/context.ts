import type z from 'zod';
import { Context } from '$lib/runes/context';

export type FormContextValue<T extends z.ZodType<object> = z.ZodType<object>> = {
	schema: T;
	defaultValues?: Partial<z.output<T>>;
	errors: () => Partial<Record<keyof z.output<T>, string>>;
	onblur: () => void;
};

export const formContext = new Context<FormContextValue>('form');
