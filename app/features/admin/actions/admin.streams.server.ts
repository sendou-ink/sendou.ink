import type { ActionFunctionArgs } from "react-router";
import { clearCombinedStreamsCache } from "~/features/core/streams/streams.server";
import { parseFormDataWithImages } from "~/form/parse.server";
import { requireRole } from "~/modules/permissions/guards.server";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import { assertUnreachable } from "~/utils/types";
import { externalStreamActionSchema } from "../admin-schemas";
import * as ExternalStreamRepository from "../ExternalStreamRepository.server";

export const action = async ({ request }: ActionFunctionArgs) => {
	requireRole("ADMIN");

	const result = await parseFormDataWithImages({
		request,
		schema: externalStreamActionSchema,
	});

	if (!result.success) {
		return { fieldErrors: result.fieldErrors };
	}

	const data = result.data;

	switch (data._action) {
		case "CREATE": {
			await ExternalStreamRepository.insert({
				name: data.name,
				url: data.url,
				avatarImgId: data.avatar,
				startTime: dateToDatabaseTimestamp(data.startTime),
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
};
