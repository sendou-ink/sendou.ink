import { customAlphabet } from "nanoid";

const nanoid = customAlphabet(
	// avoid 1/I and 0/O
	"23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz",
);

let sessionId: string | undefined;

export function getSessionId(): string {
	if (!sessionId) {
		sessionId = nanoid(10);
	}
	return sessionId;
}
