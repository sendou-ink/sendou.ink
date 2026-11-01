import type { NotNull, Transaction } from "kysely";
import { sql } from "kysely";
import { db } from "~/db/sql";
import type { DB } from "~/db/tables";
import * as ChatRepository from "~/features/chat/ChatRepository.server";
import {
	commonUserSelect,
	jsonArrayFrom,
	tournamentLogoWithDefault,
} from "~/utils/kysely.server";
import {
	BROADCAST_WEAPONS_PER_PLAYER,
	DEFAULT_BROADCAST_SETTINGS,
} from "./broadcast-constants";
import type {
	BroadcastChannel,
	BroadcastSettings,
	BroadcastStoredState,
	ProducerState,
} from "./broadcast-types";
import * as Producer from "./core/Producer";

interface BroadcastKey {
	tournamentId: number;
	channel: Pick<BroadcastChannel, "platform" | "account">;
}

/** Producer state, settings and chat room of the channel's broadcast, `undefined` before anything was written to it. */
export function findByChannel({ tournamentId, channel }: BroadcastKey) {
	return db
		.selectFrom("TournamentBroadcast")
		.select([
			"TournamentBroadcast.state",
			"TournamentBroadcast.settings",
			"TournamentBroadcast.chatRoomId",
		])
		.where("TournamentBroadcast.tournamentId", "=", tournamentId)
		.where("TournamentBroadcast.platform", "=", channel.platform)
		.where("TournamentBroadcast.account", "=", channel.account)
		.executeTakeFirst();
}

/** Broadcasts owning the given chat rooms, with their tournament's cast accounts to find the channel by. */
export async function findAllByChatRoomIds(chatRoomIds: number[]) {
	if (chatRoomIds.length === 0) return [];

	return db
		.selectFrom("TournamentBroadcast")
		.innerJoin(
			"Tournament",
			"Tournament.id",
			"TournamentBroadcast.tournamentId",
		)
		.innerJoin(
			"CalendarEvent",
			"CalendarEvent.tournamentId",
			"TournamentBroadcast.tournamentId",
		)
		.select((eb) => [
			"TournamentBroadcast.chatRoomId",
			"TournamentBroadcast.tournamentId",
			"TournamentBroadcast.platform",
			"TournamentBroadcast.account",
			"Tournament.castAccounts",
			"Tournament.isFinalized",
			"CalendarEvent.name as tournamentName",
			tournamentLogoWithDefault(eb).as("logoUrl"),
		])
		.where("TournamentBroadcast.chatRoomId", "in", chatRoomIds)
		.$narrowType<{ chatRoomId: NotNull }>()
		.execute();
}

/** Casters by their user ids, in no particular order. */
export function findAllCastersByUserIds(userIds: number[]) {
	if (userIds.length === 0) return Promise.resolve([]);

	return db
		.selectFrom("User")
		.select(["User.id as userId", "User.username as name", "User.pronouns"])
		.where("User.id", "in", userIds)
		.execute();
}

// xxx: do we want to show country?
/** Members of the teams with their top weapons (favorites first, then the pool's order), owner first then in joining order. */
export function findAllPlayersByTournamentTeamIds(tournamentTeamIds: number[]) {
	if (tournamentTeamIds.length === 0) return Promise.resolve([]);

	return db
		.selectFrom("TournamentTeamMember")
		.innerJoin("User", "User.id", "TournamentTeamMember.userId")
		.select((eb) => [
			...commonUserSelect(eb, { inTournament: true }),
			"TournamentTeamMember.tournamentTeamId",
			sql<
				string | null
			>`coalesce("TournamentTeamMember"."inGameName", "User"."inGameName")`.as(
				"inGameName",
			),
			jsonArrayFrom(
				eb
					.selectFrom("UserWeaponPool")
					.select("UserWeaponPool.weaponSplId")
					.whereRef("UserWeaponPool.userId", "=", "User.id")
					.orderBy("UserWeaponPool.isFavorite", "desc")
					.orderBy("UserWeaponPool.sortOrder", "asc")
					.limit(BROADCAST_WEAPONS_PER_PLAYER),
			).as("weapons"),
		])
		.where("TournamentTeamMember.tournamentTeamId", "in", tournamentTeamIds)
		.orderBy(sql`"TournamentTeamMember"."role" = 'OWNER'`, "desc")
		.orderBy("TournamentTeamMember.createdAt", "asc")
		.execute();
}

/** Sets fields of the staged producer state one by one, leaving the other fields as concurrent edits left them. */
export async function updateNext({
	patch,
	...key
}: BroadcastKey & { patch: Partial<ProducerState> }) {
	const entries = Object.entries(patch);
	if (entries.length === 0) return;

	await insertIfMissing(key);

	await db
		.updateTable("TournamentBroadcast")
		.set({
			state: sql<string>`json_set("TournamentBroadcast"."state", ${jsonSetPairs(entries, "$.next")})`,
		})
		.where("TournamentBroadcast.tournamentId", "=", key.tournamentId)
		.where("TournamentBroadcast.platform", "=", key.channel.platform)
		.where("TournamentBroadcast.account", "=", key.channel.account)
		.execute();
}

/** Sets the producer state's fields that apply as soon as set, leaving the rest of it as it is. */
export async function updateState({
	patch,
	...key
}: BroadcastKey & {
	patch: Partial<Pick<BroadcastStoredState, "liveResults" | "ink">>;
}) {
	const entries = Object.entries(patch);
	if (entries.length === 0) return;

	await insertIfMissing(key);

	await db
		.updateTable("TournamentBroadcast")
		.set({
			state: sql<string>`json_set("TournamentBroadcast"."state", ${jsonSetPairs(entries)})`,
		})
		.where("TournamentBroadcast.tournamentId", "=", key.tournamentId)
		.where("TournamentBroadcast.platform", "=", key.channel.platform)
		.where("TournamentBroadcast.account", "=", key.channel.account)
		.execute();
}

/**
 * Replaces the producer state if its `takeId` is still the one the new state was based on.
 * Returns `false` when another Take got there first.
 */
export async function replaceState({
	state,
	expectedTakeId,
	...key
}: BroadcastKey & { state: BroadcastStoredState; expectedTakeId: number }) {
	await insertIfMissing(key);

	const result = await db
		.updateTable("TournamentBroadcast")
		.set({ state: JSON.stringify(state) })
		.where("TournamentBroadcast.tournamentId", "=", key.tournamentId)
		.where("TournamentBroadcast.platform", "=", key.channel.platform)
		.where("TournamentBroadcast.account", "=", key.channel.account)
		.where(
			sql`json_extract("TournamentBroadcast"."state", '$.takeId')`,
			"=",
			expectedTakeId,
		)
		.executeTakeFirst();

	return result.numUpdatedRows > 0n;
}

/** Sets the given settings, leaving the others as they are (the theme and the show info are saved by separate forms). */
export async function updateSettings({
	patch,
	...key
}: BroadcastKey & { patch: Partial<BroadcastSettings> }) {
	const entries = Object.entries(patch);
	if (entries.length === 0) return;

	await insertIfMissing(key);

	await db
		.updateTable("TournamentBroadcast")
		.set({
			settings: sql<string>`json_set("TournamentBroadcast"."settings", ${jsonSetPairs(entries)})`,
		})
		.where("TournamentBroadcast.tournamentId", "=", key.tournamentId)
		.where("TournamentBroadcast.platform", "=", key.channel.platform)
		.where("TournamentBroadcast.account", "=", key.channel.account)
		.execute();
}

/**
 * Gives the channel's broadcast its chat room, creating the broadcast too when nothing was written to it yet.
 * Returns the room's id and whether it was created now.
 */
export function insertChatRoomIfMissing({
	expiresAt,
	...key
}: BroadcastKey & { expiresAt: Date }) {
	return db.transaction().execute(async (trx) => {
		await insertIfMissing(key, trx);

		const broadcast = await trx
			.selectFrom("TournamentBroadcast")
			.select(["TournamentBroadcast.id", "TournamentBroadcast.chatRoomId"])
			.where("TournamentBroadcast.tournamentId", "=", key.tournamentId)
			.where("TournamentBroadcast.platform", "=", key.channel.platform)
			.where("TournamentBroadcast.account", "=", key.channel.account)
			.executeTakeFirstOrThrow();

		if (broadcast.chatRoomId !== null) {
			return { chatRoomId: broadcast.chatRoomId, isCreated: false };
		}

		const room = await ChatRepository.insertRoom(
			{ type: "TOURNAMENT_BROADCAST", expiresAt },
			trx,
		);

		await trx
			.updateTable("TournamentBroadcast")
			.set({ chatRoomId: room.id })
			.where("TournamentBroadcast.id", "=", broadcast.id)
			.execute();

		return { chatRoomId: room.id, isCreated: true };
	});
}

function insertIfMissing(
	{ tournamentId, channel }: BroadcastKey,
	trx?: Transaction<DB>,
) {
	return (trx ?? db)
		.insertInto("TournamentBroadcast")
		.values({
			tournamentId,
			platform: channel.platform,
			account: channel.account,
			state: JSON.stringify(Producer.initialState()),
			// xxx: autofill settings (theme) from the same channel's broadcast in the last tournament of this series
			settings: JSON.stringify(DEFAULT_BROADCAST_SETTINGS),
		})
		.onConflict((oc) =>
			oc.columns(["tournamentId", "platform", "account"]).doNothing(),
		)
		.execute();
}

function jsonSetPairs(entries: Array<[string, unknown]>, basePath = "$") {
	return sql.join(
		entries.map(
			([field, value]) =>
				sql`${`${basePath}.${field}`}, json(${JSON.stringify(value)})`,
		),
	);
}
