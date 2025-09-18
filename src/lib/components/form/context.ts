import type z from 'zod';
import { Context } from '$lib/runes/context';
import type { RemoteForm, RemoteFormInput } from '@sveltejs/kit';

export type FormContextValue<T extends RemoteFormInput> = {
	action: RemoteForm<T, void | { errors: Partial<Record<keyof Output, string>> }>;
	defaultValues?: Partial<z.output<T>> | null;
	errors: () => Partial<Record<keyof z.output<T>, string>>;
	onblur: () => void;
};

export const formContext = new Context<FormContextValue>('form');
