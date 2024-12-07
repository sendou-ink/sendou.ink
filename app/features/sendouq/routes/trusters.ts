import type { LoaderFunctionArgs, SerializeFrom } from "@remix-run/node";
import { requireUserId } from "~/features/auth/core/user.server";
import * as QRepository from "~/features/sendouq/QRepository.server";

export type TrustersLoaderData = SerializeFrom<typeof loader>;

export const loader = async ({ request }: LoaderFunctionArgs) => {
	const { id: userId } = await requireUserId(request);

	return {
		trusters: await QRepository.usersThatTrusted(userId),
	};
};
