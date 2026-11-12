import { timingSafeEqual } from "node:crypto";

/** Whether the secrets are equal, compared in constant time so the time taken doesn't leak how much of them matches. */
export function isSameSecret(a: string | Buffer, b: string | Buffer) {
	const left = typeof a === "string" ? Buffer.from(a) : a;
	const right = typeof b === "string" ? Buffer.from(b) : b;

	return left.length === right.length && timingSafeEqual(left, right);
}
