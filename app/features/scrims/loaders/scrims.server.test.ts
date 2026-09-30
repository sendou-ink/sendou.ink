import { beforeEach, describe, expect, test } from "vitest";
import * as AssociationFactory from "~/db/seed/factories/AssociationFactory";
import * as ScrimPostFactory from "~/db/seed/factories/ScrimPostFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import type { SerializeFrom } from "~/utils/remix";
import { wrappedLoader } from "~/utils/Test";
import { scrimsPage } from "~/utils/urls";
import { scrimsSearchParams } from "../scrims-search-params";
import { loader } from "./scrims.server";

const users = UserFactory.pool();

const viewerId = () => users.id(1);
const otherUserId = () => users.id(2);
const requesterId = () => users.id(3);

const scrimsLoader = wrappedLoader<SerializeFrom<typeof loader>>({ loader });

describe("scrims loader", () => {
	beforeEach(async () => {
		await users.create(3);
	});

	const createAssociation = () =>
		AssociationFactory.create(
			{ userId: otherUserId() },
			{ memberUserIds: [viewerId()] },
		);

	const loadFilteredByAssociation = (associationId: number) =>
		scrimsLoader({
			user: viewerId(),
			url: scrimsSearchParams.href(scrimsPage(), { associationId }),
		});

	test("only lists posts of the association filtered by", async () => {
		const association = await createAssociation();

		const { id: associationPostId } = await ScrimPostFactory.create({
			users: [{ userId: otherUserId(), isOwner: 1 }],
			visibility: { forAssociation: association.id },
		});
		await ScrimPostFactory.create({
			users: [{ userId: otherUserId(), isOwner: 1 }],
		});

		const data = await loadFilteredByAssociation(association.id);

		expect(data.posts.neutral.map((post) => post.id)).toEqual([
			associationPostId,
		]);
	});

	test("keeps the viewer's own public post listed while filtering by association", async () => {
		const association = await createAssociation();

		const { id: ownPostId } = await ScrimPostFactory.create({
			users: [{ userId: viewerId(), isOwner: 1 }],
		});

		const data = await loadFilteredByAssociation(association.id);

		expect(data.posts.owned.map((post) => post.id)).toEqual([ownPostId]);
	});

	test("keeps a booked scrim listed while filtering by association", async () => {
		const association = await createAssociation();

		const { id: bookedPostId } = await ScrimPostFactory.create(
			{
				users: [{ userId: viewerId(), isOwner: 1 }],
			},
			{
				requests: [
					{
						users: [{ userId: requesterId(), isOwner: 1 }],
						isAccepted: true,
					},
				],
			},
		);

		const data = await loadFilteredByAssociation(association.id);

		expect(data.posts.booked.map((post) => post.id)).toEqual([bookedPostId]);
	});

	test("ignores a filter for an association the viewer is not in", async () => {
		const otherAssociation = await AssociationFactory.create({
			userId: otherUserId(),
		});

		const { id: postId } = await ScrimPostFactory.create({
			users: [{ userId: otherUserId(), isOwner: 1 }],
		});

		const data = await loadFilteredByAssociation(otherAssociation.id);

		expect(data.associationFilter).toBeNull();
		expect(data.posts.neutral.map((post) => post.id)).toEqual([postId]);
	});
});
