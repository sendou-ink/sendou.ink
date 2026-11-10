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

/** A broadcast's key along with the rules of the scene set it shows, which a broadcast written to the first time starts with. */
interface WriteArgs<Item extends ProducerState = ProducerState>
	extends BroadcastKey {
	rules: Producer.Rules<Item>;
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
			"User.country",
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

/** Sets the producer state's fields that apply as soon as set, leaving the rest of it as it is. */
export async function updateState({
	patch,
	...key
}: WriteArgs & {
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
 * Replaces the producer state with what `change` makes of it, read and written in one transaction so changes made at
 * the same time (e.g. two producers, or an automatic Take) don't overwrite each other. `change` returning `null`
 * leaves the state as it is. Returns whether it was changed.
 */
export function updateProducer<Item extends ProducerState>({
	change,
	...key
}: WriteArgs<Item> & {
	change: (
		state: BroadcastStoredState<Item>,
	) => BroadcastStoredState<Item> | null;
}) {
	return db.transaction().execute(async (trx) => {
		await insertIfMissing(key, trx);

		const { state } = await trx
			.selectFrom("TournamentBroadcast")
			.select("TournamentBroadcast.state")
			.where("TournamentBroadcast.tournamentId", "=", key.tournamentId)
			.where("TournamentBroadcast.platform", "=", key.channel.platform)
			.where("TournamentBroadcast.account", "=", key.channel.account)
			.executeTakeFirstOrThrow();

		const changed = change(Producer.withDefaults(key.rules, state));
		if (!changed) return false;

		await trx
			.updateTable("TournamentBroadcast")
			.set({ state: JSON.stringify(changed) })
			.where("TournamentBroadcast.tournamentId", "=", key.tournamentId)
			.where("TournamentBroadcast.platform", "=", key.channel.platform)
			.where("TournamentBroadcast.account", "=", key.channel.account)
			.execute();

		return true;
	});
}

/** Sets the given settings, leaving the others as they are (the theme and the show info are saved by separate forms). */
export async function updateSettings<
	Settings extends BroadcastSettings = BroadcastSettings,
>({ patch, ...key }: WriteArgs & { patch: Partial<Settings> }) {
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
}: WriteArgs & { expiresAt: Date }) {
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

function insertIfMissing<Item extends ProducerState>(
	{ tournamentId, channel, rules }: WriteArgs<Item>,
	trx?: Transaction<DB>,
) {
	return (trx ?? db)
		.insertInto("TournamentBroadcast")
		.values({
			tournamentId,
			platform: channel.platform,
			account: channel.account,
			state: JSON.stringify(Producer.initialState(rules)),
			// xxx: autofill settings (theme) from the same channel's broadcast in the last tournament of this series
			settings: JSON.stringify(DEFAULT_BROADCAST_SETTINGS),
		})
		.onConflict((oc) =>
			oc.columns(["tournamentId", "platform", "account"]).doNothing(),
		)
		.execute();
}

function jsonSetPairs(entries: Array<[string, unknown]>) {
	return sql.join(
		entries.map(
			([field, value]) => sql`${`$.${field}`}, json(${JSON.stringify(value)})`,
		),
	);
}
