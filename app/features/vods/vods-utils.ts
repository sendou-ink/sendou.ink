import type { User } from "~/db/types";
import { isAdmin } from "~/permissions";
import { databaseTimestampToDate } from "../../utils/dates";
import type { VideoBeingAdded, Vod } from "./vods-types";

export function canAddVideo(args: { isVideoAdder: number | null }) {
	return args.isVideoAdder;
}

export function vodToVideoBeingAdded(vod: Vod): VideoBeingAdded {
	const dateObj = databaseTimestampToDate(vod.youtubeDate);

	return {
		title: vod.title,
		youtubeId: vod.youtubeId,
		date: {
			day: dateObj.getDate(),
			month: dateObj.getMonth() + 1,
			year: dateObj.getFullYear(),
		},
		matches: vod.matches,
		type: vod.type,
		pov:
			typeof vod.pov === "string"
				? { type: "NAME", name: vod.pov }
				: vod.pov
					? {
							type: "USER",
							userId: vod.pov.id,
						}
					: undefined,
	};
}

export function canEditVideo({
	userId,
	submitterUserId,
	povUserId,
}: {
	userId?: User["id"];
	submitterUserId: User["id"];
	povUserId?: User["id"];
}) {
	if (!userId) return false;

	return (
		isAdmin({ id: userId }) ||
		userId === submitterUserId ||
		userId === povUserId
	);
}
