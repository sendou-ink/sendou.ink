import { jsonArrayFrom } from "kysely/helpers/sqlite";
import { nanoid } from "nanoid";
import { INVITE_CODE_LENGTH } from "~/constants";
import { db } from "~/db/sql";
import type { TablesInsertable, TablesUpdatable } from "~/db/tables";
import type { AssociationVirtualIdentifier } from "~/features/associations/associations-constants";
import { COMMON_USER_FIELDS } from "~/utils/kysely.server";
import { logger } from "~/utils/logger";

export async function findById(associationId: number) {
	const result = await findBy({ type: "association", associationId });

	return result.at(0) ?? null;
}

export async function findByMemberUserId(userId: number) {
	return {
		actual: await findBy({ type: "user", userId }),
		virtual: await virtualAssociationsByUserId(userId),
	};
}

const baseFindQuery = db
	.selectFrom("AssociationMember")
	.innerJoin("Association", "Association.id", "AssociationMember.associationId")
	.select((eb) => [
		"Association.id",
		"Association.name",
		jsonArrayFrom(
			eb
				.selectFrom("AssociationMember")
				.innerJoin("User", "User.id", "AssociationMember.userId")
				.whereRef("AssociationMember.associationId", "=", "Association.id")
				.select([...COMMON_USER_FIELDS, "AssociationMember.role"]),
		).as("members"),
	]);

async function findBy(
	args:
		| { type: "user"; userId: number }
		| { type: "association"; associationId: number },
) {
	const associations =
		args.type === "user"
			? await baseFindQuery
					.where("AssociationMember.userId", "=", args.userId)
					.execute()
			: await baseFindQuery
					.where("Association.id", "=", args.associationId)
					.execute();

	return associations.map((a) => ({
		...a,
		permissions: {
			MANAGE: a.members
				.filter((member) => member.role === "ADMIN")
				.map((user) => user.id),
		},
	}));
}

async function virtualAssociationsByUserId(
	userId: number,
): Promise<Array<AssociationVirtualIdentifier>> {
	const { plusTier } =
		(await db
			.selectFrom("PlusTier")
			.select(["PlusTier.tier as plusTier"])
			.where("userId", "=", userId)
			.executeTakeFirst()) ?? {};
	if (!plusTier) return [];

	if (plusTier === 1) return ["+1", "+2", "+3"] as const;
	if (plusTier === 2) return ["+2", "+3"] as const;
	if (plusTier === 3) return ["+3"] as const;

	logger.error("Invalid plusTier", { plusTier });
	return [];
}

type InsertArgs = Omit<TablesInsertable["Association"], "inviteCode"> & {
	userId: number;
};

export function insert({ userId, ...associationArgs }: InsertArgs) {
	return db.transaction().execute(async (trx) => {
		const association = await trx
			.insertInto("Association")
			.values({ ...associationArgs, inviteCode: nanoid(INVITE_CODE_LENGTH) })
			.returning("id")
			.executeTakeFirstOrThrow();

		await trx
			.insertInto("AssociationMember")
			.values({ userId, associationId: association.id, role: "ADMIN" })
			.execute();
	});
}

export function update(
	associationId: number,
	args: Partial<TablesUpdatable["Association"]>,
) {
	return db
		.updateTable("Association")
		.set(args)
		.where("id", "=", associationId)
		.execute();
}

export function addMember({
	associationId,
	userId,
}: { associationId: number; userId: number }) {
	return db
		.insertInto("AssociationMember")
		.values({ associationId, userId, role: "MEMBER" })
		.execute();
}

export function removeMember({
	associationId,
	userId,
}: { associationId: number; userId: number }) {
	return db
		.deleteFrom("AssociationMember")
		.where("associationId", "=", associationId)
		.where("userId", "=", userId)
		.execute();
}

export function del(associationId: number) {
	return db.deleteFrom("Association").where("id", "=", associationId).execute();
}
