import type { Transaction } from "kysely";
import { crud } from "~/db/crud";
import { defineQuery, mapRows, refine, unchanged } from "~/db/entity-query";
import { db } from "~/db/sql";
import type { DB } from "~/db/tables";
import type {
	MainWeaponId,
	ModeShort,
	StageId,
} from "~/modules/in-game-lists/types";
import { weaponIdToArrayWithAlts } from "~/modules/in-game-lists/weapon-ids";
import { dayMonthYearToDate } from "~/utils/dates";
import { invariant } from "~/utils/invariant";
import {
	commonUserSelect,
	jsonArrayFrom,
	jsonObjectFrom,
} from "~/utils/kysely.server";
import type { VideoBeingAdded } from "./vods-types";
import {
	extractYoutubeIdFromVideoUrl,
	hoursMinutesSecondsStringToSeconds,
} from "./vods-utils";

const videoTable = crud("Video");
const matchTable = crud("VideoMatch");
const playerTable = crud("VideoMatchPlayer");

export const { deleteById } = videoTable;

/**
 * Vods, newest published first, with `pov`: the user or the plain name whose point of view the
 * vod shows, `null` for casts.
 */
export const vods = defineQuery({
	root: "Video",
	select: (qb) =>
		qb.select((eb) => [
			"Video.id",
			"Video.title",
			"Video.type",
			"Video.youtubeId",
			"Video.submitterUserId",
			jsonObjectFrom(
				eb
					.selectFrom("VideoMatchPlayer")
					.innerJoin(
						"VideoMatch",
						"VideoMatch.id",
						"VideoMatchPlayer.videoMatchId",
					)
					.select((playerEb) => [
						"VideoMatchPlayer.playerName as name",
						jsonObjectFrom(
							playerEb
								.selectFrom("User")
								.select((userEb) => commonUserSelect(userEb))
								.whereRef("User.id", "=", "VideoMatchPlayer.playerUserId"),
						).as("user"),
					])
					.whereRef("VideoMatch.videoId", "=", "Video.id")
					.where((playerEb) =>
						playerEb.or([
							playerEb("VideoMatchPlayer.playerName", "is not", null),
							playerEb("VideoMatchPlayer.playerUserId", "is not", null),
						]),
					)
					.orderBy("VideoMatch.startsAt", "asc")
					.orderBy("VideoMatchPlayer.player", "asc")
					.limit(1),
			).as("pov"),
		]),
	map: (row) => ({ pov: row.pov?.name ?? row.pov?.user ?? null }),
	defaultSort: [["Video.youtubePublishedAt", "desc"]],
	vocabulary: () => ({
		/** Vods with a match fitting every given filter: played in the mode, on the stage and with the weapon or one of its alt skins. */
		havingMatch: ({
			mode,
			stageId,
			weapon,
		}: {
			mode: ModeShort | null;
			stageId: StageId | null;
			weapon: MainWeaponId | null;
		}) =>
			mode === null && stageId === null && weapon === null
				? unchanged("Video")
				: refine("Video", (qb) =>
						qb.where((eb) =>
							eb(
								"Video.id",
								"in",
								eb
									.selectFrom("VideoMatch")
									.select("VideoMatch.videoId")
									.$if(mode !== null, (matchQb) =>
										matchQb.where("VideoMatch.mode", "=", mode!),
									)
									.$if(stageId !== null, (matchQb) =>
										matchQb.where("VideoMatch.stageId", "=", stageId!),
									)
									// joined rather than `exists`, so the weapon's index drives the lookup instead of a scan over every match
									.$if(weapon !== null, (matchQb) =>
										matchQb
											.innerJoin(
												"VideoMatchPlayer",
												"VideoMatchPlayer.videoMatchId",
												"VideoMatch.id",
											)
											.where(
												"VideoMatchPlayer.weaponSplId",
												"in",
												weaponIdToArrayWithAlts(weapon!),
											),
									),
							),
						),
					),
		/** Vods showing the user's point of view. */
		fromPovOf: (userId: number) =>
			refine("Video", (qb) =>
				qb.where((eb) =>
					eb(
						"Video.id",
						"in",
						eb
							.selectFrom("VideoMatchPlayer")
							.innerJoin(
								"VideoMatch",
								"VideoMatch.id",
								"VideoMatchPlayer.videoMatchId",
							)
							.select("VideoMatch.videoId")
							.where("VideoMatchPlayer.playerUserId", "=", userId),
					),
				),
			),
		/** The distinct weapons played in the vod, `leading` and its alt skins first so a listing's peek shows what was filtered for. */
		withWeapons: (leading: MainWeaponId | null = null) =>
			refine("Video", (qb) =>
				qb.select((eb) => {
					const weapons = eb
						.selectFrom("VideoMatchPlayer")
						.innerJoin(
							"VideoMatch",
							"VideoMatch.id",
							"VideoMatchPlayer.videoMatchId",
						)
						.select((weaponEb) => [
							"VideoMatchPlayer.weaponSplId",
							weaponEb.fn.min("VideoMatch.startsAt").as("firstPlayedAt"),
						])
						.whereRef("VideoMatch.videoId", "=", "Video.id")
						.groupBy("VideoMatchPlayer.weaponSplId")
						.as("weapon");

					return eb
						.selectFrom(weapons)
						.select((weaponEb) => {
							const weaponIds = weaponEb.fn.agg<MainWeaponId[]>(
								"json_group_array",
								["weapon.weaponSplId"],
							);

							return (
								leading === null
									? weaponIds
									: weaponIds.orderBy(
											weaponEb(
												"weapon.weaponSplId",
												"in",
												weaponIdToArrayWithAlts(leading),
											),
											"desc",
										)
							)
								.orderBy("weapon.firstPlayedAt", "asc")
								.as("weapons");
						})
						.$asScalar()
						.$castTo<MainWeaponId[]>()
						.as("weapons");
				}),
			),
		/** The vod's matches in the order they are played, each with its weapons in player order. */
		withMatches: () =>
			refine("Video", (qb) =>
				qb.select((eb) =>
					jsonArrayFrom(
						eb
							.selectFrom("VideoMatch")
							.select((matchEb) => [
								"VideoMatch.id",
								"VideoMatch.mode",
								"VideoMatch.stageId",
								"VideoMatch.startsAt",
								matchEb
									.selectFrom("VideoMatchPlayer")
									.select((playerEb) =>
										playerEb.fn
											.agg<MainWeaponId[]>("json_group_array", [
												"VideoMatchPlayer.weaponSplId",
											])
											.orderBy("VideoMatchPlayer.player", "asc")
											.as("weapons"),
									)
									.whereRef(
										"VideoMatchPlayer.videoMatchId",
										"=",
										"VideoMatch.id",
									)
									.$asScalar()
									.$castTo<MainWeaponId[]>()
									.as("weapons"),
							])
							.whereRef("VideoMatch.videoId", "=", "Video.id")
							.orderBy("VideoMatch.startsAt", "asc"),
					).as("matches"),
				),
			),
		/** The submitter and the point of view user may edit the vod. */
		withEditPermissions: () =>
			mapRows(
				"Video",
				(row: {
					submitterUserId: number;
					pov: string | { id: number } | null;
				}) => ({
					permissions: {
						EDIT:
							typeof row.pov === "object" && row.pov !== null
								? [row.submitterUserId, row.pov.id]
								: [row.submitterUserId],
					},
				}),
			),
	}),
});

/** The vod with its publish date, matches and who may edit it. */
export function vodWithMatches(id: number) {
	return vods()
		.where({ id })
		.withColumns(["youtubePublishedAt"])
		.withMatches()
		.withEditPermissions();
}

/** The vods showing the user's point of view, with the weapons played. */
export function userVods(userId: number) {
	return vods().fromPovOf(userId).withWeapons();
}

/** Inserts the vod with its matches, returning its id. */
export function insert(args: VideoBeingAdded & { submitterUserId: number }) {
	return db.transaction().execute(async (trx) => {
		const { id } = await videoTable.insert(
			{ ...videoValues(args), submitterUserId: args.submitterUserId },
			trx,
		);
		await insertMatches(id, args, trx);

		return { id };
	});
}

/** Updates the vod and replaces its matches. The submitter stays the original one. */
export function update(args: VideoBeingAdded & { id: number }) {
	return db.transaction().execute(async (trx) => {
		await videoTable.updateById(args.id, videoValues(args), trx);
		await matchTable.delete({ videoId: args.id }, trx);
		await insertMatches(args.id, args, trx);

		return { id: args.id };
	});
}

function videoValues(args: VideoBeingAdded) {
	const youtubeId = extractYoutubeIdFromVideoUrl(args.youtubeUrl);
	invariant(youtubeId, "Invalid YouTube URL");

	return {
		title: args.title,
		type: args.type,
		youtubePublishedAt: dayMonthYearToDate(args.date),
		eventId: args.eventId ?? null,
		youtubeId,
	};
}

async function insertMatches(
	videoId: number,
	{ matches, pov }: VideoBeingAdded,
	trx: Transaction<DB>,
) {
	const insertedMatches = await matchTable.insertMany(
		matches.map((match) => ({
			videoId,
			startsAt: hoursMinutesSecondsStringToSeconds(match.startsAt),
			stageId: match.stageId,
			mode: match.mode,
		})),
		trx,
	);

	// RETURNING makes no ordering promise, so sort to line the ids up with matches
	const matchIds = insertedMatches
		.map((match) => match.id)
		.sort((a, b) => a - b);

	await playerTable.insertMany(
		matches.flatMap((match, matchIdx) =>
			match.weapons.map((weaponSplId, weaponIdx) => ({
				videoMatchId: matchIds[matchIdx],
				playerUserId: pov?.type === "USER" ? pov.userId : null,
				playerName: pov?.type === "NAME" ? pov.name : null,
				weaponSplId,
				player: weaponIdx + 1,
			})),
		),
		trx,
	);
}
