import { add, sub } from "date-fns";
import { describe, expect, test } from "vitest";
import * as Visibility from "./Visibility";

const CREATED_AT = 100;
const OWNER_ID = 7;

const row = (
	overrides: Partial<Visibility.VisibilityRow>,
): Visibility.VisibilityRow => ({
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

describe("Visibility.fromForm", () => {
	const at = new Date(1_000_000);

	test.each([
		{
			why: "public",
			form: {
				baseVisibility: "PUBLIC" as const,
				notFoundVisibility: { forAssociation: "PUBLIC" as const },
			},
			expected: null,
		},
		{
			why: "association without a later step",
			form: {
				baseVisibility: 3,
				notFoundVisibility: { at: null, forAssociation: "PUBLIC" as const },
			},
			expected: { forAssociation: 3, notFoundInstructions: undefined },
		},
		{
			why: "association widening to public",
			form: {
				baseVisibility: 3,
				notFoundVisibility: { at, forAssociation: "PUBLIC" as const },
			},
			expected: {
				forAssociation: 3,
				notFoundInstructions: [{ at: 1000, forAssociation: null }],
			},
		},
		{
			why: "friends widening to a plus tier",
			form: {
				baseVisibility: "FRIENDS" as const,
				notFoundVisibility: { at, forAssociation: "+2" as const },
			},
			expected: {
				forAssociation: "FRIENDS",
				notFoundInstructions: [{ at: 1000, forAssociation: "+2" }],
			},
		},
	])("$why", ({ form, expected }) => {
		expect(Visibility.fromForm(form)).toEqual(expected);
	});
});

describe("Visibility.toForm", () => {
	test.each([
		{
			why: "public",
			rows: [row({ isPublic: 1 })],
			expected: {
				baseVisibility: "PUBLIC",
				notFoundVisibility: { at: null, forAssociation: "PUBLIC" },
			},
		},
		{
			why: "friends of the owner",
			rows: [row({ friendsOfUserId: OWNER_ID })],
			expected: {
				baseVisibility: "FRIENDS",
				notFoundVisibility: { at: null, forAssociation: "PUBLIC" },
			},
		},
		{
			why: "association widening to a plus tier",
			rows: [row({ associationId: 3 }), row({ visibleFrom: 500, plusTier: 2 })],
			expected: {
				baseVisibility: 3,
				notFoundVisibility: { at: 500, forAssociation: "+2" },
			},
		},
	])("$why", ({ rows, expected }) => {
		expect(Visibility.toForm(rows)).toEqual(expected);
	});

	test("round-trips toRows", () => {
		const visibility = {
			forAssociation: "+1" as const,
			notFoundInstructions: [{ at: 500, forAssociation: 4 }],
		};

		const form = Visibility.toForm(
			Visibility.toRows(visibility, {
				createdAt: CREATED_AT,
				ownerId: OWNER_ID,
			}),
		);

		expect(
			Visibility.fromForm({
				...form,
				notFoundVisibility: {
					...form.notFoundVisibility,
					at: new Date(500_000),
				},
			}),
		).toEqual(visibility);
	});
});

describe("Visibility.withAudiencesOf", () => {
	const named = (overrides: Partial<Visibility.VisibilityRow>) => ({
		...row(overrides),
		associationName: overrides.associationId ? "Night owls" : null,
	});

	test("adds the audiences the user can't pick themselves", () => {
		expect(
			Visibility.withAudiencesOf(
				{ virtual: ["FRIENDS"], actual: [{ id: 1, name: "Early birds" }] },
				[named({ associationId: 3 }), named({ visibleFrom: 500, plusTier: 1 })],
			),
		).toEqual({
			virtual: ["FRIENDS", "+1"],
			actual: [
				{ id: 1, name: "Early birds" },
				{ id: 3, name: "Night owls" },
			],
		});
	});

	test("doesn't repeat the audiences the user can pick", () => {
		const associations = {
			virtual: ["FRIENDS" as const],
			actual: [{ id: 3, name: "Night owls" }],
		};

		expect(
			Visibility.withAudiencesOf(associations, [
				named({ associationId: 3 }),
				named({ visibleFrom: 500, friendsOfUserId: OWNER_ID }),
			]),
		).toEqual(associations);
	});
});

describe("Visibility.formIssues", () => {
	const startsAt = add(new Date(), { days: 2 });
	const notFoundAt = add(new Date(), { days: 1 });

	const messagesOf = (
		values: Parameters<typeof Visibility.formIssues>[0],
		options: { startsAt?: Date; isEdit?: boolean } = {},
	) =>
		Visibility.formIssues(values, { startsAt, ...options }).map(
			(issue) => issue.message,
		);

	test('no issues without a "not found" step', () => {
		expect(
			messagesOf({
				baseVisibility: 3,
				notFoundVisibility: { at: null, forAssociation: "PUBLIC" },
			}),
		).toEqual([]);
	});

	test("no issues for a step to another audience before the start", () => {
		expect(
			messagesOf({
				baseVisibility: 3,
				notFoundVisibility: { at: notFoundAt, forAssociation: "PUBLIC" },
			}),
		).toEqual([]);
	});

	test.each([
		{
			why: "same audience as the base one",
			values: {
				baseVisibility: 3,
				notFoundVisibility: { at: notFoundAt, forAssociation: 3 },
			},
			expected: "forms:errors.visibilityMustBeDifferent",
		},
		{
			why: "public content",
			values: {
				baseVisibility: "PUBLIC" as const,
				notFoundVisibility: { at: notFoundAt, forAssociation: 3 },
			},
			expected: "forms:errors.visibilityNotAllowedWhenPublic",
		},
		{
			why: "link only content",
			values: {
				baseVisibility: "LINK_ONLY" as const,
				notFoundVisibility: { at: notFoundAt, forAssociation: 3 },
			},
			expected: "forms:errors.visibilityNotAllowedWhenPublic",
		},
		{
			why: "step after the start",
			values: {
				baseVisibility: 3,
				notFoundVisibility: {
					at: add(startsAt, { hours: 1 }),
					forAssociation: "PUBLIC" as const,
				},
			},
			expected: "forms:errors.dateAfterScrimDate",
		},
	])("$why", ({ values, expected }) => {
		expect(messagesOf(values)).toEqual([expected]);
	});

	test("content starting right away can't get a step when made", () => {
		const startedAt = sub(new Date(), { minutes: 5 });

		expect(
			messagesOf(
				{
					baseVisibility: 3,
					notFoundVisibility: {
						at: sub(startedAt, { minutes: 5 }),
						forAssociation: "PUBLIC",
					},
				},
				{ startsAt: startedAt },
			),
		).toEqual(["forms:errors.canNotSetIfLookingNow"]);
	});

	test("content already started keeps its step when edited", () => {
		const startedAt = sub(new Date(), { minutes: 5 });

		expect(
			messagesOf(
				{
					baseVisibility: 3,
					notFoundVisibility: {
						at: sub(startedAt, { minutes: 5 }),
						forAssociation: "PUBLIC",
					},
				},
				{ startsAt: startedAt, isEdit: true },
			),
		).toEqual([]);
	});

	test("uses the messages given", () => {
		expect(
			Visibility.formIssues(
				{
					baseVisibility: 3,
					notFoundVisibility: {
						at: add(startsAt, { hours: 1 }),
						forAssociation: "PUBLIC",
					},
				},
				{
					startsAt,
					messages: { afterStart: "after", startingNow: "now" },
				},
			),
		).toEqual([{ path: ["notFoundVisibility"], message: "after" }]);
	});
});
