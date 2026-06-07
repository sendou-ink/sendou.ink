import type { ActionFunctionArgs } from "react-router";
import * as ChatSystemMessage from "~/features/chat/ChatSystemMessage.server";
import { notify } from "~/features/notifications/core/notify.server";
import { requirePermission } from "~/modules/permissions/guards.server";
import {
	errorToast,
	errorToastIfFalsy,
	notFoundIfFalsy,
	parseParams,
	parseRequestPayload,
} from "~/utils/remix.server";
import { assertUnreachable } from "~/utils/types";
import { idObject } from "~/utils/zod";
import { databaseTimestampToDate } from "../../../utils/dates";
import { requireUser } from "../../auth/core/user.server";
import * as Scrim from "../core/Scrim";
import * as ScrimMapByMap from "../core/ScrimMapByMap";
import * as ScrimMapListRepository from "../ScrimMapListRepository.server";
import * as ScrimMapRepository from "../ScrimMapRepository.server";
import * as ScrimPostRepository from "../ScrimPostRepository.server";
import { scrimIdActionSchema } from "../scrims-schemas";
import { parseMapPoolInput } from "../scrims-utils";

export const action = async ({ request, params }: ActionFunctionArgs) => {
	const { id } = parseParams({ params, schema: idObject });
	const post = notFoundIfFalsy(await ScrimPostRepository.findById(id));
	const user = requireUser();

	const data = await parseRequestPayload({
		request,
		schema: scrimIdActionSchema,
	});

	requirePermission(post, "MANAGE_TRACKING");

	switch (data._action) {
		case "CANCEL_SCRIM": {
			requirePermission(post, "CANCEL");

			errorToastIfFalsy(Scrim.isAccepted(post), "Scrim is not accepted");
			errorToastIfFalsy(!post.canceled, "Scrim is already canceled");

			if (databaseTimestampToDate(Scrim.getStartTime(post)) < new Date()) {
				errorToast("Cannot cancel a scrim that was already scheduled to start");
			}

			await ScrimPostRepository.cancelScrim(id, data.reason);

			const acceptedRequest = post.requests.find((r) => r.isAccepted);
			if (acceptedRequest) {
				const postTeamName = Scrim.sideDisplayName(post);
				const requestTeamName = Scrim.sideDisplayName(acceptedRequest);

				notify({
					userIds: post.users.map((m) => m.id),
					defaultSeenUserIds: [user.id],
					notification: {
						type: "SCRIM_CANCELED",
						meta: { id: post.id, opponentTeamName: requestTeamName },
					},
				});

				notify({
					userIds: acceptedRequest.users.map((m) => m.id),
					defaultSeenUserIds: [user.id],
					notification: {
						type: "SCRIM_CANCELED",
						meta: { id: post.id, opponentTeamName: postTeamName },
					},
				});
			}

			break;
		}
		case "SUBMIT_MAP_LIST": {
			const { viewerSide } = await loadMapByMapContext({ post, user });

			if (data.source === "FROM_POST") {
				errorToastIfFalsy(post.mapsTournament, "Post has no tournament to use");
			}

			const serializedPool =
				data.source === "POOL"
					? (parseMapPoolInput(data.serializedPool!)?.serialized ?? null)
					: null;

			errorToastIfFalsy(
				data.source !== "POOL" || serializedPool,
				"Invalid map pool",
			);

			const resolvedSource: "POOL" | "TOURNAMENT" =
				data.source === "POOL" ? "POOL" : "TOURNAMENT";

			await ScrimMapListRepository.submitMapListAndGenerateIfNeeded({
				scrimPostId: post.id,
				side: viewerSide,
				source: resolvedSource,
				tournamentId:
					data.source === "FROM_POST"
						? post.mapsTournament!.id
						: (data.tournamentId ?? null),
				serializedPool,
			});

			broadcastRevalidate({ post, user });
			break;
		}
		case "REMOVE_MAP_LIST": {
			const { viewerSide } = await loadMapByMapContext({ post, user });

			await ScrimMapListRepository.deleteMapList(post.id, viewerSide);

			broadcastRevalidate({ post, user });
			break;
		}
		case "REPORT_MAP": {
			const { maps } = await loadMapByMapContext({ post, user });

			const target = maps.find((m) => m.id === data.mapId);
			errorToastIfFalsy(target, "Map not found");
			errorToastIfFalsy(target!.reportedAt === null, "Map already reported");

			await ScrimMapRepository.reportMapAndGenerateNext({
				scrimPostId: post.id,
				mapId: data.mapId,
				winnerSide: data.winnerSide,
			});

			broadcastRevalidate({ post, user });
			break;
		}
		case "UNDO_MAP": {
			const { maps } = await loadMapByMapContext({ post, user });

			const latest = Scrim.lastReportedMap(maps);
			errorToastIfFalsy(ScrimMapByMap.canUndo(latest, maps), "Nothing to undo");

			await ScrimMapRepository.undoMostRecentMap(post.id);

			broadcastRevalidate({ post, user });
			break;
		}
		case "REPLAY_MAP": {
			const { maps } = await loadMapByMapContext({ post, user });

			const latest = Scrim.lastReportedMap(maps);
			errorToastIfFalsy(latest, "No map to replay");

			const currentMap = maps.find((m) => m.reportedAt === null);
			errorToastIfFalsy(currentMap, "No current map to replace");

			await ScrimMapRepository.replaceCurrentMap({
				scrimPostId: post.id,
				mode: latest!.mode,
				stageId: latest!.stageId,
			});

			broadcastMapChange({ post, type: "MAP_REPLAYED", user });
			break;
		}
		case "PICK_MAP": {
			const { maps } = await loadMapByMapContext({ post, user });

			const currentMap = maps.find((m) => m.reportedAt === null);
			errorToastIfFalsy(currentMap, "No current map to replace");

			await ScrimMapRepository.replaceCurrentMap({
				scrimPostId: post.id,
				mode: data.mode,
				stageId: data.stageId,
			});

			broadcastMapChange({ post, type: "MAP_PICKED", user });
			break;
		}
		default: {
			assertUnreachable(data);
		}
	}

	return null;
};

async function loadMapByMapContext({
	post,
	user,
}: {
	post: NonNullable<Awaited<ReturnType<typeof ScrimPostRepository.findById>>>;
	user: ReturnType<typeof requireUser>;
}) {
	const viewerSide = Scrim.sideOfUser(post, user.id);

	const maps = await ScrimMapRepository.findMapsByScrimPostId(post.id);

	if (Scrim.isTrackingLocked(maps, Scrim.getStartTime(post))) {
		errorToast("Tracking is locked");
	}

	return { viewerSide: viewerSide!, maps };
}

function broadcastRevalidate({
	post,
	user,
}: {
	post: NonNullable<Awaited<ReturnType<typeof ScrimPostRepository.findById>>>;
	user: ReturnType<typeof requireUser>;
}) {
	if (!post.chatCode) return;
	ChatSystemMessage.send({
		room: post.chatCode,
		revalidateOnly: true,
		authorUserId: user.id,
	});
}

function broadcastMapChange({
	post,
	type,
	user,
}: {
	post: NonNullable<Awaited<ReturnType<typeof ScrimPostRepository.findById>>>;
	type: "MAP_REPLAYED" | "MAP_PICKED";
	user: ReturnType<typeof requireUser>;
}) {
	if (!post.chatCode) return;
	ChatSystemMessage.send({
		room: post.chatCode,
		type,
		context: { name: user.username },
	});
}
