import { getUser } from "~/features/auth/core/user.server";
import type { SerializeFrom } from "~/utils/remix";
import { findScannerBroadcast } from "../broadcast-cast-utils.server";

export type BroadcastScannerLoaderData = SerializeFrom<typeof loader>;

/** The broadcast the logged in user's scanner follows, see `findScannerBroadcast`. */
export const loader = async () => {
	const user = getUser();

	return { broadcast: user ? await findScannerBroadcast(user.id) : null };
};
