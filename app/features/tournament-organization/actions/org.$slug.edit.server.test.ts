import { type ActionFunctionArgs, RouterContextProvider } from "react-router";
import { beforeEach, describe, expect, test } from "vitest";
import * as TournamentOrganizationFactory from "~/db/seed/factories/TournamentOrganizationFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { i18nMiddleware } from "~/modules/i18n/i18next.server";
import { wrappedAction } from "~/utils/Test";
import * as TournamentOrganizationRepository from "../TournamentOrganizationRepository.server";
import type { organizationEditFormSchema } from "../tournament-organization-schemas";
import { action } from "./org.$slug.edit.server";

const editOrgAction = wrappedAction<typeof organizationEditFormSchema>({
	action: actionWithI18n,
	isJsonSubmission: true,
});

const users = UserFactory.pool();
const adminId = () => users.id(1);
const otherAdminId = () => users.id(2);

describe("action", () => {
	beforeEach(async () => {
		await users.create(2);
	});

	test("returns a name field error when the new name's slug belongs to another organization", async () => {
		await TournamentOrganizationFactory.create({
			ownerId: otherAdminId(),
			name: "Splat Zones Weekly",
		});
		const org = await TournamentOrganizationFactory.create({
			ownerId: adminId(),
			name: "My Org",
		});

		const response = await editOrgAction(editFields("Splat Zones Weekly!"), {
			user: adminId(),
			params: { slug: org.slug },
		});

		expect(response.fieldErrors?.name).toBe("forms:errors.duplicateOrgName");
		expect(
			(await TournamentOrganizationRepository.findBySlug(org.slug))?.name,
		).toBe("My Org");
	});

	test("allows a new name that keeps the organization's own slug", async () => {
		const org = await TournamentOrganizationFactory.create({
			ownerId: adminId(),
			name: "My Org",
		});

		const response = await editOrgAction(editFields("My Org!"), {
			user: adminId(),
			params: { slug: org.slug },
		});

		expect(response.status).toBe(302);
		expect(
			(await TournamentOrganizationRepository.findBySlug(org.slug))?.name,
		).toBe("My Org!");
	});
});

// the action reads the request's i18n store, which the root middleware sets up in the app
async function actionWithI18n(args: ActionFunctionArgs) {
	let result: unknown;
	await i18nMiddleware(
		{ ...args, context: new RouterContextProvider() } as any,
		async () => {
			result = await action(args);
			return new Response();
		},
	);

	return result;
}

function editFields(name: string) {
	return {
		name,
		logo: null,
		description: null,
		members: [{ userId: adminId(), role: "ADMIN", roleDisplayName: null }],
		socials: [],
		series: [],
		badges: [],
	} as any;
}
