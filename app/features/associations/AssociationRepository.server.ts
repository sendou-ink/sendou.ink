import { sub } from "date-fns";
import type { Kysely } from "kysely";
import { db } from "~/db/sql";
import type { DB, Tables, TablesInsertable } from "~/db/tables";
import type { AssociationVirtualIdentifier } from "~/features/associations/associations-constants";
import { ASSOCIATION } from "~/features/associations/associations-constants";
import * as FriendRepository from "~/features/friends/FriendRepository.server";
import { SCRIM } from "~/features/scrims/scrims-constants";
import { isSupporter } from "~/modules/permissions/utils";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import { LimitReachedError } from "~/utils/errors";
import { shortNanoid } from "~/utils/id";
import { commonUserSelect, jsonArrayFrom } from "~/utils/kysely.server";
import { logger } from "~/utils/logger";

interface FindOptions {
	withMembers: boolean;
}

export async function findById(
	associationId: number,
	options: FindOptions = { withMembers: false },
) {
	const result = await findBy({ type: "association", associationId }, options);

	return result.at(0) ?? null;
}

export async function findByMemberUserId(
	userId: number,
	options: FindOptions = { withMembers: false },
) {
	return {
		actual: await findBy({ type: "user", userId }, options),
		virtual: await virtualAssociationsByUserId(userId),
		friendIds: await FriendRepository.findFriendIds(userId),
	};
}

export async function findByInviteCode(
	inviteCode: string,
	options: FindOptions = { withMembers: false },
) {
	const associations = await findBy(
		{ type: "inviteCode", inviteCode },
		options,
	);

	return associations.at(0);
}

const baseFindQuery = (options: FindOptions) =>
	db
		.selectFrom("AssociationMember")
		.innerJoin(
			"Association",
			"Association.id",
			"AssociationMember.associationId",
		)
		.select(["Association.id", "Association.name"])
		.$if(options.withMembers, (qb) =>
			qb.select((eb) =>
				jsonArrayFrom(
					eb
						.selectFrom("AssociationMember")
						.innerJoin("User", "User.id", "AssociationMember.userId")
						.whereRef("AssociationMember.associationId", "=", "Association.id")
						.select((memberEb) => [
							...commonUserSelect(memberEb),
							"AssociationMember.role",
						]),
				).as("members"),
			),
		);

async function findBy(
	args:
		| { type: "user"; userId: number }
		| { type: "association"; associationId: number }
		| { type: "inviteCode"; inviteCode: string },
	options: FindOptions,
) {
	const associations =
		args.type === "user"
			? await baseFindQuery(options)
					.where("AssociationMember.userId", "=", args.userId)
					.execute()
			: args.type === "inviteCode"
				? await baseFindQuery(options)
						.where("Association.inviteCode", "=", args.inviteCode)
						.execute()
				: await baseFindQuery(options)
						.where("Association.id", "=", args.associationId)
						.execute();

	return associations.map((a) => {
		const members = a.members ?? [];
		const adminIds = memberIdsWithRole(members, "ADMIN");
		const managerIds = memberIdsWithRole(members, "MANAGER");

		return {
			...a,
			members: a.members?.map((member) => ({
				...member,
				permissions: {
					REMOVE: memberRemoverIds({ member, adminIds, managerIds }),
				},
			})),
			permissions: {
				MANAGE: adminIds,
				MANAGE_INVITE_LINK: [...adminIds, ...managerIds],
			},
		};
	});
}

function memberIdsWithRole(
	members: Array<{ id: number; role: Tables["AssociationMember"]["role"] }>,
	role: Tables["AssociationMember"]["role"],
) {
	return members
		.filter((member) => member.role === role)
		.map((member) => member.id);
}

/** Admins can remove anyone but themselves, managers only regular members. */
function memberRemoverIds({
	member,
	adminIds,
	managerIds,
}: {
	member: { id: number; role: Tables["AssociationMember"]["role"] };
	adminIds: Array<number>;
	managerIds: Array<number>;
}) {
	const removerIds =
		member.role === "ADMIN"
			? []
			: member.role === "MANAGER"
				? adminIds
				: [...adminIds, ...managerIds];

	return removerIds.filter((id) => id !== member.id);
}

const DEFAULT_VIRTUAL_ASSOCIATIONS: Array<AssociationVirtualIdentifier> = [
	"FRIENDS",
];

async function virtualAssociationsByUserId(
	userId: number,
): Promise<Array<AssociationVirtualIdentifier>> {
	const { plusTier } =
		(await db
			.selectFrom("PlusTier")
			.select(["PlusTier.tier as plusTier"])
			.where("userId", "=", userId)
			.executeTakeFirst()) ?? {};
	if (!plusTier) return [...DEFAULT_VIRTUAL_ASSOCIATIONS];

	if (plusTier === 1)
		return [...DEFAULT_VIRTUAL_ASSOCIATIONS, "+1", "+2", "+3"] as const;
	if (plusTier === 2)
		return [...DEFAULT_VIRTUAL_ASSOCIATIONS, "+2", "+3"] as const;
	if (plusTier === 3) return [...DEFAULT_VIRTUAL_ASSOCIATIONS, "+3"] as const;

	logger.error("Invalid plusTier", { plusTier });
	return [...DEFAULT_VIRTUAL_ASSOCIATIONS];
}

type InsertArgs = Omit<TablesInsertable["Association"], "inviteCode"> & {
	userId: number;
};

export async function findInviteCodeById(associationId: number) {
	const row = await db
		.selectFrom("Association")
		.select(["Association.inviteCode"])
		.where("id", "=", associationId)
		.executeTakeFirstOrThrow();

	return row.inviteCode;
}

export function insert({ userId, ...associationArgs }: InsertArgs) {
	return db.transaction().execute(async (trx) => {
		const association = await trx
			.insertInto("Association")
			.values({ ...associationArgs, inviteCode: shortNanoid() })
			.returning("id")
			.executeTakeFirstOrThrow();

		await trx
			.insertInto("AssociationMember")
			.values({ userId, associationId: association.id, role: "ADMIN" })
			.execute();

		const { count, patronTier } = await trx
			.selectFrom("AssociationMember")
			.innerJoin("User", "User.id", "AssociationMember.userId")
			.select((eb) => [eb.fn.countAll<number>().as("count"), "User.patronTier"])
			.where("AssociationMember.userId", "=", userId)
			.executeTakeFirstOrThrow();

		const maxCount = isSupporter({ patronTier })
			? ASSOCIATION.MAX_COUNT_SUPPORTER
			: ASSOCIATION.MAX_COUNT_REGULAR_USER;

		if (count > maxCount) {
			throw new LimitReachedError("Max amount of associations reached");
		}

		return association;
	});
}

export function refreshInviteCode(associationId: number) {
	return db
		.updateTable("Association")
		.set({ inviteCode: shortNanoid() })
		.where("id", "=", associationId)
		.execute();
}

export function insertMember({
	associationId,
	userId,
}: {
	associationId: number;
	userId: number;
}) {
	return db
		.insertInto("AssociationMember")
		.values({ associationId, userId, role: "MEMBER" })
		.execute();
}

export function updateMemberRole({
	associationId,
	userId,
	role,
}: {
	associationId: number;
	userId: number;
	role: Tables["AssociationMember"]["role"];
}) {
	return db
		.updateTable("AssociationMember")
		.set({ role })
		.where("associationId", "=", associationId)
		.where("userId", "=", userId)
		.execute();
}

export function deleteMember({
	associationId,
	userId,
}: {
	associationId: number;
	userId: number;
}) {
	return db
		.deleteFrom("AssociationMember")
		.where("associationId", "=", associationId)
		.where("userId", "=", userId)
		.execute();
}

/** Removes the member and, when they were the admin, promotes `newAdminUserId` in their place. */
export function handleMemberLeaving({
	associationId,
	userId,
	newAdminUserId,
}: {
	associationId: number;
	userId: number;
	newAdminUserId?: number;
}) {
	return db.transaction().execute(async (trx) => {
		await trx
			.deleteFrom("AssociationMember")
			.where("associationId", "=", associationId)
			.where("userId", "=", userId)
			.execute();

		if (typeof newAdminUserId === "number") {
			await trx
				.updateTable("AssociationMember")
				.set({ role: "ADMIN" })
				.where("associationId", "=", associationId)
				.where("userId", "=", newAdminUserId)
				.execute();
		}
	});
}

/**
 * How many upcoming scrim posts and open lobbies have a step of their visibility schedule limited to the
 * association. Deleting the association would drop those steps, hiding content limited only to it from everyone.
 */
export function countUpcomingContentLimitedTo(associationId: number) {
	return countUpcomingContentLimitedToWith(db, associationId);
}

/** Deletes the association, refused (returns `false`) while {@link countUpcomingContentLimitedTo} is above zero. */
export function deleteById(associationId: number) {
	return db.transaction().execute(async (trx) => {
		if ((await countUpcomingContentLimitedToWith(trx, associationId)) > 0) {
			return false;
		}

		await trx
			.deleteFrom("Association")
			.where("id", "=", associationId)
			.execute();

		return true;
	});
}

async function countUpcomingContentLimitedToWith(
	executor: Kysely<DB>,
	associationId: number,
) {
	const listedSince = dateToDatabaseTimestamp(
		sub(new Date(), { hours: SCRIM.LISTED_HOURS_AFTER_START }),
	);

	const { scrimPostCount, lobbyCount } = await executor
		.selectFrom("ContentVisibility")
		.leftJoin("ScrimPost", "ScrimPost.id", "ContentVisibility.scrimPostId")
		.leftJoin("Lobby", "Lobby.id", "ContentVisibility.lobbyId")
		.select(({ fn }) => [
			fn
				.count<number>("ContentVisibility.scrimPostId")
				.distinct()
				.as("scrimPostCount"),
			fn.count<number>("ContentVisibility.lobbyId").distinct().as("lobbyCount"),
		])
		.where("ContentVisibility.associationId", "=", associationId)
		.where((eb) =>
			eb.or([
				eb.and([
					eb("ScrimPost.id", "is not", null),
					eb("ScrimPost.startsAt", ">=", listedSince),
					eb.not(
						eb.exists(
							eb
								.selectFrom("ScrimPostRequest")
								.select("ScrimPostRequest.id")
								.whereRef("ScrimPostRequest.scrimPostId", "=", "ScrimPost.id")
								.where("ScrimPostRequest.isAccepted", "=", 1),
						),
					),
				]),
				eb.and([
					eb("Lobby.id", "is not", null),
					eb("Lobby.endedAt", "is", null),
				]),
			]),
		)
		.executeTakeFirstOrThrow();

	return scrimPostCount + lobbyCount;
}
