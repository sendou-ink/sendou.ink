import { describe, expect, test } from "vitest";
import * as TournamentOrganizationFactory from "~/db/seed/factories/TournamentOrganizationFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { wrappedLoader } from "~/utils/Test";
import type { GetTournamentOrganizationResponse } from "../schema";
import { loader } from "./org.$id";

const orgLoader = wrappedLoader<Response>({ loader });

describe("GET /api/org/:id", () => {
	test("leaves placeholder players out of the members", async () => {
		const owner = await UserFactory.create();
		const placeholder = await UserFactory.createPlaceholder();
		const organization = await TournamentOrganizationFactory.create(
			{ ownerId: owner.id },
			{ members: [{ userId: placeholder.id, role: "MEMBER" }] },
		);

		const response = await orgLoader({
			params: { id: String(organization.id) },
		});
		const { members } =
			(await response.json()) as GetTournamentOrganizationResponse;

		expect(members.map((member) => member.userId)).toEqual([owner.id]);
	});
});
