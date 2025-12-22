import type { LoaderFunctionArgs, SerializeFrom } from "@remix-run/node";
import { requireUserId } from "~/features/auth/core/user.server";
import * as SQGroupRepository from "~/features/sendouq/SQGroupRepository.server";

export type TrustersLoaderData = SerializeFrom<typeof loader>;

export const loader = async ({ request }: LoaderFunctionArgs) => {
	const { id: userId } = await requireUserId(request);

	return {
		trusters: await SQGroupRepository.usersThatTrusted(userId),
	};
};
