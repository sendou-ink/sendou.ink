import { describe, expect, test } from "vitest";
import * as Visibility from "./Visibility";

const CREATED_AT = 100;
const OWNER_ID = 7;

const row = (overrides: Partial<Visibility.VisibilityRow>) => ({
	visibleFrom: CREATED_AT,
	associationId: null,
	plusTier: null,
	friendsOfUserId: null,
	isPublic: 0,
	...overrides,
});

describe("Visibility.toRows", () => {
	test.each([
		{ why: "public", visibility: null, expected: [row({ isPublic: 1 })] },
		{
			why: "association",
			visibility: { forAssociation: 3 },
			expected: [row({ associationId: 3 })],
		},
		{
			why: "plus tier",
			visibility: { forAssociation: "+2" as const },
			expected: [row({ plusTier: 2 })],
		},
		{
			why: "friends of the owner",
			visibility: { forAssociation: "FRIENDS" as const },
			expected: [row({ friendsOfUserId: OWNER_ID })],
		},
		{
			why: "staged, then public",
			visibility: {
				forAssociation: 3,
				notFoundInstructions: [{ at: 500, forAssociation: null }],
			},
			expected: [
				row({ associationId: 3 }),
				row({ visibleFrom: 500, isPublic: 1 }),
			],
		},
	])("$why", ({ visibility, expected }) => {
		expect(
			Visibility.toRows(visibility, {
				createdAt: CREATED_AT,
				ownerId: OWNER_ID,
			}),
		).toEqual(expected);
	});
});
