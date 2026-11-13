import { add, sub } from "date-fns";
import { beforeEach, describe, expect, test } from "vitest";
import * as AssociationFactory from "~/db/seed/factories/AssociationFactory";
import * as LobbyFactory from "~/db/seed/factories/LobbyFactory";
import * as ScrimPostFactory from "~/db/seed/factories/ScrimPostFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import * as AssociationRepository from "./AssociationRepository.server";

const users = UserFactory.pool();
const adminId = () => users.id(1);
const otherUserId = () => users.id(2);
const bookerId = () => users.id(3);

const hoursFromNow = (hours: number) =>
	dateToDatabaseTimestamp(add(new Date(), { hours }));

describe("deleteById", () => {
	beforeEach(async () => {
		await users.create(3);
	});

	test.each<{
		why: string;
		createContent: (associationId: number) => Promise<unknown>;
	}>([
		{
			why: "an upcoming scrim post is limited to it",
			createContent: (associationId) =>
				ScrimPostFactory.create({
					users: [{ userId: otherUserId(), isOwner: 1 }],
					startsAt: hoursFromNow(1),
					visibility: { forAssociation: associationId },
				}),
		},
		{
			why: "a scrim post is limited to it only if not found",
			createContent: (associationId) =>
				ScrimPostFactory.create({
					users: [{ userId: otherUserId(), isOwner: 1 }],
					startsAt: hoursFromNow(1),
					visibility: {
						forAssociation: "+1",
						notFoundInstructions: [
							{ at: hoursFromNow(0.5), forAssociation: associationId },
						],
					},
				}),
		},
		{
			why: "a scrim post that started within the listing window is limited to it",
			createContent: (associationId) =>
				ScrimPostFactory.create({
					users: [{ userId: otherUserId(), isOwner: 1 }],
					startsAt: hoursFromNow(-1),
					visibility: { forAssociation: associationId },
				}),
		},
		{
			why: "an open lobby is limited to it",
			createContent: (associationId) =>
				LobbyFactory.create({
					hostUserId: otherUserId(),
					visibility: { forAssociation: associationId },
				}),
		},
	])("refuses while $why", async ({ createContent }) => {
		const association = await AssociationFactory.create({ userId: adminId() });
		await createContent(association.id);

		const isDeleted = await AssociationRepository.deleteById(association.id);

		expect(isDeleted).toBe(false);
		expect(await AssociationRepository.findById(association.id)).not.toBeNull();
	});

	test.each<{
		why: string;
		createContent: (associationId: number) => Promise<unknown>;
	}>([
		{ why: "no content is limited to it", createContent: async () => {} },
		{
			why: "the scrim post limited to it is no longer listed",
			createContent: (associationId) =>
				ScrimPostFactory.create({
					users: [{ userId: otherUserId(), isOwner: 1 }],
					startsAt: dateToDatabaseTimestamp(sub(new Date(), { hours: 4 })),
					visibility: { forAssociation: associationId },
				}),
		},
		{
			why: "the scrim post limited to it is booked",
			createContent: (associationId) =>
				ScrimPostFactory.create(
					{
						users: [{ userId: otherUserId(), isOwner: 1 }],
						startsAt: hoursFromNow(1),
						visibility: { forAssociation: associationId },
					},
					{
						requests: [
							{ users: [{ userId: bookerId(), isOwner: 1 }], isAccepted: true },
						],
					},
				),
		},
		{
			why: "the lobby limited to it has ended",
			createContent: (associationId) =>
				LobbyFactory.create(
					{
						hostUserId: otherUserId(),
						visibility: { forAssociation: associationId },
					},
					{ isEnded: true },
				),
		},
		{
			why: "only content limited to another association is upcoming",
			createContent: async () => {
				const otherAssociation = await AssociationFactory.create({
					userId: otherUserId(),
				});

				return ScrimPostFactory.create({
					users: [{ userId: otherUserId(), isOwner: 1 }],
					startsAt: hoursFromNow(1),
					visibility: { forAssociation: otherAssociation.id },
				});
			},
		},
	])("deletes when $why", async ({ createContent }) => {
		const association = await AssociationFactory.create({ userId: adminId() });
		await createContent(association.id);

		const isDeleted = await AssociationRepository.deleteById(association.id);

		expect(isDeleted).toBe(true);
		expect(await AssociationRepository.findById(association.id)).toBeNull();
	});
});
