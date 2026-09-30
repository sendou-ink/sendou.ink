import { nanoid } from "nanoid";

export const SHORT_NANOID_LENGTH = 10;

export function shortNanoid() {
	return nanoid(SHORT_NANOID_LENGTH);
}
