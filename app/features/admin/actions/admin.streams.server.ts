import { clearCombinedStreamsCache } from "~/features/core/streams/streams.server";
import { defineAction } from "~/form/define-action.server";
import { requireRole } from "~/modules/permissions/guards.server";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import { assertUnreachable } from "~/utils/types";
import { externalStreamActionSchema } from "../admin-schemas";
import * as ExternalStreamRepository from "../ExternalStreamRepository.server";

export const action = defineAction(
	{ body: externalStreamActionSchema },
	async ({ resolveImages }) => {
		requireRole("ADMIN");

		const data = await resolveImages();

		switch (data._action) {
			case "CREATE": {
				await ExternalStreamRepository.insert({
					name: data.name,
					url: data.url,
					avatarImgId: data.avatar,
					startsAt: dateToDatabaseTimestamp(data.startTime),
				});
				break;
			}
			case "DELETE": {
				await ExternalStreamRepository.deleteById(data.id);
				break;
			}
			default: {
				assertUnreachable(data);
			}
		}

		clearCombinedStreamsCache();

		return null;
	},
);
