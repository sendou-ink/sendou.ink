import { beforeEach, describe, expect, test } from "vitest";
import * as ImageFactory from "~/db/seed/factories/ImageFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { invariant } from "~/utils/invariant";
import { assertResponseErrored } from "~/utils/Test";
import { imageFieldValueToImgId } from "./image-field.server";

const users = UserFactory.pool();
const editorId = () => users.id(1);
const otherUserId = () => users.id(2);

const existing = (imgId: number) => ({
	type: "EXISTING" as const,
	imgId,
	url: "logo.webp",
});

async function editor() {
	const user = await UserRepository.findLeanById(editorId());
	invariant(user, "Expected the editor to exist");
	return user;
}

async function thrownBy(promise: Promise<unknown>) {
	return promise.then(
		() => null,
		(error: unknown) => error,
	);
}

describe("imageFieldValueToImgId", () => {
	beforeEach(async () => {
		await users.create(2);
	});

	test("resolves a removed image to null", async () => {
		expect(
			await imageFieldValueToImgId({ value: null, user: await editor() }),
		).toBeNull();
	});

	test("keeps the user's own upload", async () => {
		const image = await ImageFactory.create({ submitterUserId: editorId() });

		expect(
			await imageFieldValueToImgId({
				value: existing(image.id),
				user: await editor(),
			}),
		).toBe(image.id);
	});

	test("keeps another user's upload the edited entity already holds", async () => {
		const image = await ImageFactory.create({ submitterUserId: otherUserId() });

		expect(
			await imageFieldValueToImgId({
				value: existing(image.id),
				user: await editor(),
				isCurrentImgId: (imgId) => imgId === image.id,
			}),
		).toBe(image.id);
	});

	test("rejects another user's upload the edited entity does not hold", async () => {
		const image = await ImageFactory.create({ submitterUserId: otherUserId() });

		const thrown = await thrownBy(
			imageFieldValueToImgId({
				value: existing(image.id),
				user: await editor(),
				isCurrentImgId: () => false,
			}),
		);

		expect(thrown).toBeInstanceOf(Response);
		assertResponseErrored(thrown as Response, "Image does not belong to you");
	});

	test("rejects an image id that does not exist", async () => {
		const thrown = await thrownBy(
			imageFieldValueToImgId({
				value: existing(999_999),
				user: await editor(),
			}),
		);

		expect(thrown).toBeInstanceOf(Response);
	});
});
