/**
 * Associations and their members. Finding one computes its per-object permissions from the members' roles:
 * the admin manages it, the admin and starred members (`MANAGER`) share its invite link and each member lists
 * who can remove them.
 */
import { db } from "~/db/sql";
import type { Tables, TablesInsertable } from "~/db/tables";
import * as FriendRepository from "~/features/friends/FriendRepository.server";
import { isSupporter } from "~/modules/permissions/utils";
import { LimitReachedError } from "~/utils/errors";
import { shortNanoid } from "~/utils/id";
import { commonUserSelect, jsonArrayFrom } from "~/utils/kysely.server";
import * as Association from "./core/Association";

interface FindOptions {
	/** Include `members`, without which the permissions are computed from no members (empty). */
	withMembers: boolean;
}

/** The association by its id, `null` if there is none. */
export async function findById(
	associationId: number,
	options: FindOptions = { withMembers: false },
) {
	const result = await findBy({ type: "association", associationId }, options);

	return result.at(0) ?? null;
}

/**
 * Everything the user can limit content to: the associations they are a member of (`actual`), the audiences
 * that come without joining one (`virtual`, see `Association.virtualIdentifiersOf`) and their friends' ids.
 */
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

/** The association whose invite link has the code, `undefined` if the code is unknown or was reset. */
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

		if (
			count >
			Association.maxMembershipCount({
				isSupporter: isSupporter({ patronTier }),
			})
		) {
			throw new LimitReachedError("Max amount of associations reached");
		}

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

/** Adds the user as a regular member. Limits are checked by the caller. */
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
 * Deletes the association and its memberships. Its `ContentVisibility` rows go with it, so content limited
 * only to it is then seen by nobody but its own participants.
 */
export function deleteById(associationId: number) {
	return db.deleteFrom("Association").where("id", "=", associationId).execute();
}
