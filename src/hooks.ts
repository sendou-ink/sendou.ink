import type { Transport } from '@sveltejs/kit';
import { err, Err, ok, Ok } from 'neverthrow';

export const transport: Transport = {
	Ok: {
		encode: (value) => value instanceof Ok && value.value,
		decode: (x) => ok(x)
	},
	Err: {
		encode: (value) => value instanceof Err && value.error,
		decode: (x) => err(x)
	}
};
