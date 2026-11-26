/**
 * Associations and their members. Finding one computes its per-object permissions from the members' roles:
 * the admin manages it, the admin and starred members (`MANAGER`) share its invite link and each member lists
 * who can remove them.
 */
import type { ExpressionBuilder, Kysely, Transaction } from "kysely";
import { db } from "~/db/sql";
import type { DB, Tables, TablesInsertable } from "~/db/tables";
import { listedPostsCutoff } from "~/features/scrims/scrims-utils";
import { isSupporter } from "~/modules/permissions/utils";
import { LimitReachedError } from "~/utils/errors";
import { shortNanoid } from "~/utils/id";
import { commonUserSelect, jsonArrayFrom } from "~/utils/kysely.server";
import * as Association from "./core/Association";

/** The association with its members by its id, `null` if there is none. */
export async function findById(associationId: number) {
	const association = await db
		.selectFrom("Association")
		.select((eb) => ["Association.id", "Association.name", membersJson(eb)])
		.where("Association.id", "=", associationId)
		.executeTakeFirst();

	return association ? withPermissions(association) : null;
}

/** The association with its members whose invite link has the code, `undefined` if the code is unknown or was reset. */
export async function findByInviteCode(inviteCode: string) {
	const association = await db
		.selectFrom("Association")
		.select((eb) => ["Association.id", "Association.name", membersJson(eb)])
		.where("Association.inviteCode", "=", inviteCode)
		.executeTakeFirst();

	return association ? withPermissions(association) : undefined;
}

/** The associations the user is a member of, with their members. */
export async function findAllWithMembersByUserId(userId: number) {
	const associations = await db
		.selectFrom("AssociationMember")
		.innerJoin(
			"Association",
			"Association.id",
			"AssociationMember.associationId",
		)
		.select((eb) => ["Association.id", "Association.name", membersJson(eb)])
		.where("AssociationMember.userId", "=", userId)
		.execute();

	return associations.map(withPermissions);
}

/** The ids and names of the associations the user is a member of. */
export function findAllByMemberUserId(userId: number) {
	return db
		.selectFrom("AssociationMember")
		.innerJoin(
			"Association",
			"Association.id",
			"AssociationMember.associationId",
		)
		.select(["Association.id", "Association.name"])
		.where("AssociationMember.userId", "=", userId)
		.execute();
}

/**
 * Everything the user can limit content to: the associations they are a member of (`actual`) and the audiences
 * that come without joining one (`virtual`, see `Association.virtualIdentifiersOf`).
 */
export async function findVisibilityOptionsByUserId(userId: number) {
	return {
		actual: await findAllByMemberUserId(userId),
		virtual: await virtualAssociationsByUserId(userId),
	};
}

function membersJson(eb: ExpressionBuilder<DB, "Association">) {
	return jsonArrayFrom(
		eb
			.selectFrom("AssociationMember")
			.innerJoin("User", "User.id", "AssociationMember.userId")
			.whereRef("AssociationMember.associationId", "=", "Association.id")
			.select((memberEb) => [
				...commonUserSelect(memberEb),
				"AssociationMember.role",
			]),
	).as("members");
}

function withPermissions<
	TMember extends { id: number; role: Tables["AssociationMember"]["role"] },
>(association: { id: number; name: string; members: Array<TMember> }) {
	const adminIds = memberIdsWithRole(association.members, "ADMIN");
	const managerIds = memberIdsWithRole(association.members, "MANAGER");

	return {
		...association,
		members: association.members.map((member) => ({
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

async function virtualAssociationsByUserId(userId: number) {
	const row = await db
		.selectFrom("PlusTier")
		.select("PlusTier.tier")
		.where("userId", "=", userId)
		.executeTakeFirst();

	return Association.virtualIdentifiersOf(row?.tier ?? null);
}

type InsertArgs = Omit<TablesInsertable["Association"], "inviteCode"> & {
	userId: number;
};

/** The code of the association's invite link, kept out of `findById` & co. as only some members may see it. */
export async function findInviteCodeById(associationId: number) {
	const row = await db
		.selectFrom("Association")
		.select(["Association.inviteCode"])
		.where("id", "=", associationId)
		.executeTakeFirstOrThrow();

	return row.inviteCode;
}

/**
 * Makes an association with its creator as the admin and a fresh invite code. Throws `LimitReachedError`
 * (and makes nothing) if the creator would be in more associations than `Association.maxMembershipCount`.
 */
export function insert({ userId, ...associationArgs }: InsertArgs) {
	return db.transaction().execute(async (trx) => {
		const association = await trx
			.insertInto("Association")
			.values({ ...associationArgs, inviteCode: shortNanoid() })
			.returning("id")
			.executeTakeFirstOrThrow();

		await insertMemberWithinLimit(
			{ userId, associationId: association.id, role: "ADMIN" },
			trx,
		);

		return association;
	});
}

/** Replaces the invite code, so links shared with the old one stop working. */
export function refreshInviteCode(associationId: number) {
	return db
		.updateTable("Association")
		.set({ inviteCode: shortNanoid() })
		.where("id", "=", associationId)
		.execute();
}

/** Adds the user as a regular member. Throws `LimitReachedError` if that takes them past their association count limit. */
export function insertMember(args: { associationId: number; userId: number }) {
	return db
		.transaction()
		.execute((trx) =>
			insertMemberWithinLimit({ ...args, role: "MEMBER" }, trx),
		);
}

async function insertMemberWithinLimit(
	{
		associationId,
		userId,
		role,
	}: {
		associationId: number;
		userId: number;
		role: Tables["AssociationMember"]["role"];
	},
	trx: Transaction<DB>,
) {
	await trx
		.insertInto("AssociationMember")
		.values({ associationId, userId, role })
		.execute();

	const { count, patronTier } = await trx
		.selectFrom("AssociationMember")
		.innerJoin("User", "User.id", "AssociationMember.userId")
		.select((eb) => [eb.fn.countAll<number>().as("count"), "User.patronTier"])
		.where("AssociationMember.userId", "=", userId)
		.executeTakeFirstOrThrow();

	if (
		count >
		Association.maxMembershipCount({ isSupporter: isSupporter({ patronTier }) })
	) {
		throw new LimitReachedError("Max amount of associations reached");
	}
}

/** Stars (`MANAGER`) or unstars (`MEMBER`) a member, or makes them the admin. */
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

/**
 * Removes the user from the association, whether removed by someone else or leaving. When the admin leaves,
 * `newAdminUserId` (see `Association.resolveNewAdmin`) is promoted in their place.
 */
export function deleteMember({
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

/**
 * Deletes the association and its memberships, refused (returns `false`) while {@link countUpcomingContentLimitedTo}
 * is above zero, as its `ContentVisibility` rows go with it.
 */
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
	const listedSince = listedPostsCutoff();

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
