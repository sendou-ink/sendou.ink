import { beforeEach, describe, expect, test } from "vitest";
import * as BadgeFactory from "~/db/seed/factories/BadgeFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import * as Badges from "./Badges.server";

const users = UserFactory.pool();
const editorId = () => users.id(1);
const otherUserId = () => users.id(2);

describe("Badges.attachable", () => {
	beforeEach(async () => {
		await users.create(2);
	});

	test("includes managed badges and attached badges the editor does not manage", async () => {
		const managed = await BadgeFactory.create(null, {
			managerIds: [editorId()],
		});
		const attached = await BadgeFactory.create(null, {
			managerIds: [otherUserId()],
		});
		await BadgeFactory.create(null, { managerIds: [otherUserId()] });

		const result = await Badges.attachable({
			managerIds: [editorId()],
			attached: [attached],
		});

		expect(result.map((badge) => badge.id)).toEqual([managed.id, attached.id]);
	});

	test("lists a badge both managed and attached once", async () => {
		const badge = await BadgeFactory.create(null, {
			managerIds: [editorId(), otherUserId()],
		});

		const result = await Badges.attachable({
			managerIds: [editorId(), otherUserId()],
			attached: [badge],
		});

		expect(result.map((b) => b.id)).toEqual([badge.id]);
	});
});
