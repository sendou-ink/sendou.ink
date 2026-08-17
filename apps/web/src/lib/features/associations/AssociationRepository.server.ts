import { logger } from "@sendou/utils/logger";
import * as FriendRepository from "#lib/features/friends/FriendRepository.server.ts";
import { db } from "#lib/server/db/sql.ts";
import { commonUserSelect, jsonArrayFrom } from "#lib/server/kysely.ts";
import type { AssociationVirtualIdentifier } from "./associations-types.ts";

interface FindOptions {
	withMembers: boolean;
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
						.select((eb) => [
							...commonUserSelect(eb),
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

	return associations.map((a) => ({
		...a,
		permissions: {
			MANAGE: (a.members ?? [])
				.filter((member) => member.role === "ADMIN")
				.map((user) => user.id),
		},
	}));
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
