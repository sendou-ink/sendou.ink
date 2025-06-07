import { jsonArrayFrom } from "kysely/helpers/sqlite";
import { db } from "~/db/sql";
import type { TablesInsertable, TablesUpdatable } from "~/db/tables";
import type { AssociationVirtualIdentifier } from "~/features/associations/associations-constants";
import { shortNanoid } from "~/utils/id";
import { COMMON_USER_FIELDS } from "~/utils/kysely.server";
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
						.select([...COMMON_USER_FIELDS, "AssociationMember.role"]),
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

	return associations.map((a) => ({
		...a,
		permissions: {
			MANAGE: (a.members ?? [])
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

export function refreshInviteCode(associationId: number) {
	return db
		.updateTable("Association")
		.set({ inviteCode: shortNanoid() })
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
