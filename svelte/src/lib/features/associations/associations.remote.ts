import { invalid, redirect } from "@sveltejs/kit";
import { form, query, requested } from "$app/server";
import type * as v from "valibot";
import * as AssociationRepository from "~/features/associations/AssociationRepository.server";
import { ASSOCIATION } from "~/features/associations/associations-constants";
import { createNewAssociationSchema } from "~/features/associations/associations-schemas";
import { associationsPage } from "~/features/associations/associations-urls";
import * as Association from "~/features/associations/core/Association";
import { LimitReachedError } from "~/utils/errors";
import { inviteCode as inviteCodeSchemaValue } from "~/utils/schema";
import { remoteFormSchema } from "#lib/form/remote-form-schema.ts";
import {
	badRequestIfFalsy,
	errorToastIfFalsy,
	requirePermission,
} from "#lib/server/respond.ts";
import { requireUser } from "#lib/server/shims/user.server.ts";
import {
	associationIdSchema,
	associationMemberSchema,
	inviteCodeSchema,
} from "./associations-schemas.ts";

/** Associations the user is a member of, with the invite code where they may share it. */
export const getAssociations = query(async () => {
	const user = requireUser();

	const associations = (
		await AssociationRepository.findByMemberUserId(user.id, {
			withMembers: true,
		})
	).actual;

	const associationsWithInviteCodes: Array<
		(typeof associations)[number] & { inviteCode: string | undefined }
	> = [];
	for (const association of associations) {
		associationsWithInviteCodes.push({
			...association,
			inviteCode: association.permissions.MANAGE_INVITE_LINK.includes(user.id)
				? await AssociationRepository.findInviteCodeById(association.id)
				: undefined,
		});
	}

	return associationsWithInviteCodes;
});

/** The association behind an invite link, `null` if there is none or the user is already in it. */
export const getAssociationToJoin = query(
	inviteCodeSchemaValue,
	async (inviteCode) => {
		const user = requireUser();

		const association = await AssociationRepository.findByInviteCode(
			inviteCode,
			{ withMembers: true },
		);
		if (!association) return null;

		if (association.members!.some((member) => member.id === user.id)) {
			return null;
		}

		return { name: association.name };
	},
);

export const createAssociation = form(
	remoteFormSchema(createNewAssociationSchema),
	async ({ name }, issue) => {
		const user = requireUser();

		try {
			await AssociationRepository.insert({ name, userId: user.id });
		} catch (error) {
			if (error instanceof LimitReachedError) {
				invalid(issue.name("forms:errors.maxAssociationsReached"));
			}
			throw error;
		}

		void getAssociations().refresh();

		redirect(303, associationsPage());
	},
);

export const removeMember = form(
	associationMemberSchema,
	async ({ associationId, userId }) => {
		const association = await findAssociation(associationId);
		const memberToRemove = badRequestIfFalsy(
			association.members!.find((member) => member.id === userId),
		);

		requirePermission(memberToRemove, "REMOVE");

		await AssociationRepository.deleteMember({ userId, associationId });

		await refreshPage();
	},
);

export const addManager = form(associationMemberSchema, (body) =>
	updateManagerRole(body, "MANAGER"),
);

export const removeManager = form(associationMemberSchema, (body) =>
	updateManagerRole(body, "MEMBER"),
);

export const deleteAssociation = form(
	associationIdSchema,
	async ({ associationId }) => {
		await requireAssociationPermission(associationId, "MANAGE");

		await AssociationRepository.deleteById(associationId);

		await refreshPage();
	},
);

export const refreshInviteCode = form(
	associationIdSchema,
	async ({ associationId }) => {
		await requireAssociationPermission(associationId, "MANAGE_INVITE_LINK");

		await AssociationRepository.refreshInviteCode(associationId);

		await refreshPage();

		return { toast: "Invite code reset" };
	},
);

export const joinAssociation = form(
	inviteCodeSchema,
	async ({ inviteCode }) => {
		const user = requireUser();

		const associationToJoin = badRequestIfFalsy(
			await AssociationRepository.findByInviteCode(inviteCode, {
				withMembers: true,
			}),
		);
		errorToastIfFalsy(
			associationToJoin.members?.every((member) => member.id !== user.id),
			"You are already a member of this association",
		);
		errorToastIfFalsy(
			associationToJoin.members!.length <
				ASSOCIATION.MAX_ASSOCIATION_MEMBER_COUNT,
			"Association is full",
		);

		const maxAssociationCount = user.roles.includes("SUPPORTER")
			? ASSOCIATION.MAX_COUNT_SUPPORTER
			: ASSOCIATION.MAX_COUNT_REGULAR_USER;

		errorToastIfFalsy(
			(await AssociationRepository.findByMemberUserId(user.id)).actual.length <
				maxAssociationCount,
			`Regular users can only be a member of ${maxAssociationCount} associations (supporters ${ASSOCIATION.MAX_COUNT_SUPPORTER})`,
		);

		await AssociationRepository.insertMember({
			userId: user.id,
			associationId: associationToJoin.id,
		});

		await refreshPage();
	},
);

export const leaveAssociation = form(
	associationIdSchema,
	async ({ associationId }) => {
		const user = requireUser();
		const association = await findAssociation(associationId);

		const isAdmin = association.permissions.MANAGE.includes(user.id);
		const newAdmin = isAdmin
			? Association.resolveNewAdmin(association.members!)
			: null;

		errorToastIfFalsy(
			!isAdmin || newAdmin,
			"You cannot leave an association you manage without a starred member to take over",
		);

		await AssociationRepository.handleMemberLeaving({
			userId: user.id,
			associationId,
			newAdminUserId: newAdmin?.id,
		});

		await refreshPage();

		return { toast: "Left association" };
	},
);

async function updateManagerRole(
	{ associationId, userId }: v.InferOutput<typeof associationMemberSchema>,
	role: "MANAGER" | "MEMBER",
) {
	const association = await requireAssociationPermission(
		associationId,
		"MANAGE",
	);

	errorToastIfFalsy(
		association.members!.some(
			(member) => member.id === userId && member.role !== "ADMIN",
		),
		"Not a member of the association",
	);

	await AssociationRepository.updateMemberRole({ associationId, userId, role });

	await refreshPage();
}

/** Sends the page's fresh data back in the mutation's own response (single-flight), instead of the client refetching everything. */
async function refreshPage() {
	void getAssociations().refresh();
	await requested(getAssociationToJoin, 1).refreshAll();
}

async function findAssociation(associationId: number) {
	return badRequestIfFalsy(
		await AssociationRepository.findById(associationId, { withMembers: true }),
	);
}

async function requireAssociationPermission(
	associationId: number,
	permission: "MANAGE" | "MANAGE_INVITE_LINK",
) {
	const association = await findAssociation(associationId);

	requirePermission(association, permission);

	return association;
}
