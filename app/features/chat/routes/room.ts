import type { ActionFunctionArgs } from "react-router";
import { z } from "zod";
import { requireUser } from "~/features/auth/core/user.server";
import { parseRequestPayload } from "~/utils/remix.server";
import * as RoomLinkRepository from "../RoomLinkRepository.server";

const roomLinkSchema = z.object({
	// xxx: validate matches regexp
	url: z.url(),
});

export const action = async ({ request }: ActionFunctionArgs) => {
	const user = requireUser();
	const data = await parseRequestPayload({
		request,
		schema: roomLinkSchema,
	});

	await RoomLinkRepository.upsert({ userId: user.id, url: data.url });

	return null;
};
