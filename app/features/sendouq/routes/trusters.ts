import type { LoaderFunctionArgs } from "react-router";
import { requireUserId } from "~/features/auth/core/user.server";
import * as SQGroupRepository from "~/features/sendouq/SQGroupRepository.server";
import type { SerializeFrom } from "~/utils/remix";

export type TrustersLoaderData = SerializeFrom<typeof loader>;

export const loader = async ({ request }: LoaderFunctionArgs) => {
	const { id: userId } = await requireUserId(request);

	return {
		trusters: await SQGroupRepository.usersThatTrusted(userId),
	};
};
