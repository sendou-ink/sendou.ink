import { nanoid } from "nanoid";

export const SHORT_NANOID_LENGTH = 10;

/**
 * Generates a short, unique identifier string (wraps nanoid using a smaller length than the default).
 */
export function shortNanoid() {
	return nanoid(SHORT_NANOID_LENGTH);
}
