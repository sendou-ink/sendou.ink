import { createHmac, timingSafeEqual } from "node:crypto";
import { ServerConfig } from "~/config.server";

/** Signs a share link of the post, letting anyone who opens it see the post as the sharer does. */
export function token({
	itemId,
	sharerId,
}: {
	itemId: string;
	sharerId: number;
}) {
	return createHmac("sha256", ServerConfig.sessionSecret)
		.update(`feed-share:${itemId}:${sharerId}`)
		.digest("base64url")
		.slice(0, 22);
}

/** Whether the token was made by `token` for the post and sharer. */
export function isValid({
	itemId,
	sharerId,
	token: given,
}: {
	itemId: string;
	sharerId: number;
	token: string;
}) {
	const expected = Buffer.from(token({ itemId, sharerId }));
	const actual = Buffer.from(given);

	return expected.length === actual.length && timingSafeEqual(expected, actual);
}
