import type { ActionFunctionArgs } from "react-router";
import * as ChatSystemMessage from "~/features/chat/ChatSystemMessage.server";
import { notify } from "~/features/notifications/core/notify.server";
import { tournamentDataCached } from "~/features/tournament-bracket/core/Tournament.server";
import { requirePermission } from "~/modules/permissions/guards.server";
import {
	errorToast,
	errorToastIfFalsy,
	notFoundIfFalsy,
	parseParams,
	parseRequestPayload,
} from "~/utils/remix.server";
import { idObject } from "~/utils/zod";
import { databaseTimestampToDate } from "../../../utils/dates";
import { requireUser } from "../../auth/core/user.server";
import * as Scrim from "../core/Scrim";
import * as ScrimMapByMap from "../core/ScrimMapByMap";
import * as ScrimMapByMapRepository from "../ScrimMapByMapRepository.server";
import * as ScrimPostRepository from "../ScrimPostRepository.server";
import {
	cancelScrimSchema,
	scrimMapByMapActionSchema,
} from "../scrims-schemas";

export const action = async ({ request, params }: ActionFunctionArgs) => {
	const { id } = parseParams({ params, schema: idObject });
	const post = notFoundIfFalsy(await ScrimPostRepository.findById(id));

	const user = requireUser();

	const formData = await request.clone().formData();
	// xxx: this is weird, convert to switch...case at action function elvel following similar pattern to elsewhere on the codebase
	if (formData.get("_action")) {
		return handleMapByMapAction({ post, user, request });
	}

	const data = await parseRequestPayload({
		request,
		schema: cancelScrimSchema,
	});

	requirePermission(post, "CANCEL");

	errorToastIfFalsy(Scrim.isAccepted(post), "Scrim is not accepted");
	errorToastIfFalsy(!post.canceled, "Scrim is already canceled");

	if (databaseTimestampToDate(Scrim.getStartTime(post)) < new Date()) {
		errorToast("Cannot cancel a scrim that was already scheduled to start");
	}

	await ScrimPostRepository.cancelScrim(id, {
		userId: user.id,
		reason: data.reason,
	});

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

	return null;
};

async function handleMapByMapAction({
	post,
	user,
	request,
}: {
	post: NonNullable<Awaited<ReturnType<typeof ScrimPostRepository.findById>>>;
	user: ReturnType<typeof requireUser>;
	request: Request;
}) {
	const data = await parseRequestPayload({
		request,
		schema: scrimMapByMapActionSchema,
	});

	const viewerSide = Scrim.sideOfUser(post, user.id);
	errorToastIfFalsy(viewerSide, "You are not a participant in this scrim");

	const broadcastRevalidate = () => {
		if (!post.chatCode) return;
		ChatSystemMessage.send({
			room: post.chatCode,
			revalidateOnly: true,
			authorUserId: user.id,
		});
	};

	const [maps, mapLists] = await Promise.all([
		ScrimMapByMapRepository.findMapsByScrimPostId(post.id),
		ScrimMapByMapRepository.findMapListsByScrimPostId(post.id),
	]);

	if (Scrim.isTrackingLocked(maps, mapLists)) {
		errorToast("Tracking is locked");
	}

	switch (data._action) {
		case "SUBMIT_MAP_LIST": {
			await ScrimMapByMapRepository.upsertMapList({
				scrimPostId: post.id,
				side: viewerSide!,
				source: data.source,
				tournamentId: data.tournamentId ?? null,
				serializedPool: data.serializedPool ?? null,
			});

			if (maps.length === 0) {
				await tryGenerateAndInsertNextMap({ post, user, maps });
			}
			break;
		}
		case "REMOVE_MAP_LIST": {
			await ScrimMapByMapRepository.deleteMapList(post.id, viewerSide!);
			break;
		}
		case "REPORT_MAP": {
			const target = maps.find((m) => m.id === data.mapId);
			errorToastIfFalsy(target, "Map not found");
			errorToastIfFalsy(target!.reportedAt === null, "Map already reported");

			await ScrimMapByMapRepository.reportMapWinner({
				mapId: data.mapId,
				winnerSide: data.winnerSide,
				reportedByUserId: user.id,
			});

			const reportedMaps = maps.map((m) =>
				m.id === data.mapId
					? { ...m, winnerSide: data.winnerSide, reportedAt: 1 }
					: m,
			);
			await tryGenerateAndInsertNextMap({ post, user, maps: reportedMaps });
			break;
		}
		case "UNDO_MAP": {
			const latest = Scrim.lastReportedMap(maps);
			errorToastIfFalsy(ScrimMapByMap.canUndo(latest, maps), "Nothing to undo");

			await ScrimMapByMapRepository.undoMostRecentMap(post.id);
			break;
		}
		case "REPLAY_MAP": {
			const latest = Scrim.lastReportedMap(maps);
			errorToastIfFalsy(latest, "No map to replay");

			const currentMap = maps.find((m) => m.reportedAt === null);
			errorToastIfFalsy(currentMap, "No current map to replace");

			await ScrimMapByMapRepository.replaceCurrentMapAsReplay({
				scrimPostId: post.id,
				mode: latest!.mode,
				stageId: latest!.stageId,
				replayOfIndex: latest!.index,
			});
			break;
		}
	}

	broadcastRevalidate();
	return null;
}

async function resolveTournamentPool(
	tournamentId: number,
	user: ReturnType<typeof requireUser>,
) {
	const data = await tournamentDataCached({ tournamentId, user });
	return data.ctx.toSetMapPool;
}

// xxx: should this be in inside repository?
async function tryGenerateAndInsertNextMap({
	post,
	user,
	maps,
}: {
	post: NonNullable<Awaited<ReturnType<typeof ScrimPostRepository.findById>>>;
	user: ReturnType<typeof requireUser>;
	maps: Awaited<
		ReturnType<typeof ScrimMapByMapRepository.findMapsByScrimPostId>
	>;
}) {
	const mapLists = await ScrimMapByMapRepository.findMapListsByScrimPostId(
		post.id,
	);
	if (mapLists.length === 0) return;

	const tournamentPools = new Map<
		number,
		Awaited<ReturnType<typeof resolveTournamentPool>>
	>();
	for (const list of mapLists) {
		if (list.source !== "TOURNAMENT" || !list.tournamentId) continue;
		if (tournamentPools.has(list.tournamentId)) continue;
		tournamentPools.set(
			list.tournamentId,
			await resolveTournamentPool(list.tournamentId, user),
		);
	}

	const pool = ScrimMapByMap.unionPool(mapLists, tournamentPools);
	if (pool.isEmpty()) return;

	const next = ScrimMapByMap.generateNextMap({
		pool,
		history: maps.map((m) => ({ mode: m.mode, stageId: m.stageId })),
	});

	await ScrimMapByMapRepository.insertMap({
		scrimPostId: post.id,
		index: Scrim.nextMapIndex(maps),
		mode: next.mode,
		stageId: next.stageId,
	});
}
