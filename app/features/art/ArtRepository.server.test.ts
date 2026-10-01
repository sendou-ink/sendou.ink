import { beforeEach, describe, expect, test } from "vitest";
import * as ArtFactory from "~/db/seed/factories/ArtFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { withUserId } from "~/utils/Test";
import * as ArtRepository from "./ArtRepository.server";
import type { ArtSource } from "./art-types";

const users = UserFactory.pool();

const authorId = () => users.id(1);
const otherAuthorId = () => users.id(2);
const taggedUserId = () => users.id(3);

beforeEach(async () => {
	await users.create(3);
});

const idsOf = (rows: Array<{ id: number }>) =>
	rows.map((row) => row.id).sort((a, b) => a - b);

async function tagIdByName(name: string) {
	const tags = await ArtRepository.tags().execute();
	const tag = tags.find((t) => t.name === name);
	if (!tag) throw new Error(`No tag named ${name}`);
	return tag.id;
}

describe("ArtRepository.arts", () => {
	test("leaves out art whose image awaits validation", async () => {
		const validated = await ArtFactory.create({ authorId: authorId() });
		await ArtFactory.create({ authorId: authorId(), validatedAt: null });

		const result = await ArtRepository.arts().execute();

		expect(idsOf(result)).toEqual([validated.id]);
	});

	test("awaitingValidation lists only art whose image awaits validation", async () => {
		await ArtFactory.create({ authorId: authorId() });
		const unvalidated = await ArtFactory.create({
			authorId: authorId(),
			validatedAt: null,
		});

		const result = await ArtRepository.arts().awaitingValidation().execute();

		expect(idsOf(result)).toEqual([unvalidated.id]);
	});

	test("the author may edit and the tagged users unlink", async () => {
		await ArtFactory.create({
			authorId: authorId(),
			linkedUsers: [taggedUserId()],
		});

		const [art] = await ArtRepository.arts().execute();

		expect(art.permissions).toEqual({
			EDIT: [authorId()],
			UNLINK: [taggedUserId()],
		});
	});

	describe("involvingUser", () => {
		test.each<{ source: ArtSource; expected: Array<"made" | "taggedIn"> }>([
			{ source: "ALL", expected: ["made", "taggedIn"] },
			{ source: "MADE-BY", expected: ["made"] },
			{ source: "MADE-OF", expected: ["taggedIn"] },
		])("$source", async ({ source, expected }) => {
			const made = await ArtFactory.create({
				authorId: taggedUserId(),
				linkedUsers: [taggedUserId()],
			});
			const taggedIn = await ArtFactory.create({
				authorId: authorId(),
				linkedUsers: [taggedUserId()],
			});
			await ArtFactory.create({ authorId: otherAuthorId() });

			const result = await ArtRepository.arts()
				.involvingUser(taggedUserId(), source)
				.execute();

			const artIds = { made: made.id, taggedIn: taggedIn.id };
			expect(idsOf(result)).toEqual(
				expected.map((key) => artIds[key]).sort((a, b) => a - b),
			);
		});
	});

	describe("bestOfEachAuthor", () => {
		test("picks the author's showcase art over their newer art", async () => {
			const showcase = await ArtFactory.create({ authorId: authorId() });
			await ArtFactory.create({ authorId: authorId() });
			const otherShowcase = await ArtFactory.create({
				authorId: otherAuthorId(),
			});

			const result = await ArtRepository.arts().bestOfEachAuthor().execute();

			expect(idsOf(result)).toEqual([showcase.id, otherShowcase.id]);
		});

		test("falls back to the author's newest art without a showcase", async () => {
			const showcase = await ArtFactory.create({ authorId: authorId() });
			const newest = await ArtFactory.create({ authorId: authorId() });
			await ArtRepository.deleteById(showcase.id);

			const result = await ArtRepository.arts().bestOfEachAuthor().execute();

			expect(idsOf(result)).toEqual([newest.id]);
		});

		test("with a tag, picks among the author's art having it", async () => {
			await ArtFactory.create({ authorId: authorId() });
			const tagged = await ArtFactory.create({
				authorId: authorId(),
				tags: [{ name: "Character" }],
			});
			await ArtFactory.create({
				authorId: otherAuthorId(),
				tags: [{ name: "Weapon" }],
			});

			const result = await ArtRepository.arts()
				.bestOfEachAuthor(await tagIdByName("Character"))
				.execute();

			expect(idsOf(result)).toEqual([tagged.id]);
		});
	});
});

describe("ArtRepository.unlinkOwnFromArt", () => {
	test("removes only the actor from the tagged users", async () => {
		const art = await ArtFactory.create({
			authorId: authorId(),
			linkedUsers: [otherAuthorId(), taggedUserId()],
		});

		await withUserId(taggedUserId(), () =>
			ArtRepository.unlinkOwnFromArt(art.id),
		);

		const [result] = await ArtRepository.arts().withLinkedUsers().execute();
		expect(result.linkedUsers.map((user) => user.id)).toEqual([
			otherAuthorId(),
		]);
	});
});

describe("ArtRepository.deleteOrphanTags", () => {
	test("deletes only the tags no art has", async () => {
		const art = await ArtFactory.create({
			authorId: authorId(),
			tags: [{ name: "Orphan1" }, { name: "Orphan2" }],
		});
		await ArtFactory.create({
			authorId: authorId(),
			tags: [{ name: "InUse" }],
		});
		await ArtRepository.deleteById(art.id);

		const deletedCount = await ArtRepository.deleteOrphanTags();

		expect(deletedCount).toBe(2);
		const tags = await ArtRepository.tags().execute();
		expect(tags.map((tag) => tag.name)).toEqual(["InUse"]);
	});
});

describe("ArtRepository.insert", () => {
	test("makes only the author's first art their showcase", async () => {
		const [first, second] = await ArtFactory.createMany(2, {
			authorId: authorId(),
		});

		const result = await ArtRepository.arts().execute();

		expect(result.find((art) => art.id === first.id)?.isShowcase).toBe(true);
		expect(result.find((art) => art.id === second.id)?.isShowcase).toBe(false);
	});
});

describe("ArtRepository.update", () => {
	test("replaces the tagged users and tags", async () => {
		const art = await ArtFactory.create({
			authorId: authorId(),
			linkedUsers: [otherAuthorId()],
			tags: [{ name: "Character" }],
		});

		await ArtRepository.update(art.id, {
			description: "Updated",
			linkedUsers: [taggedUserId()],
			tags: [{ name: "Weapon" }],
			isShowcase: 1,
		});

		const [result] = await ArtRepository.arts()
			.withTags()
			.withLinkedUsers()
			.execute();
		expect(result.description).toBe("Updated");
		expect(result.linkedUsers.map((user) => user.id)).toEqual([taggedUserId()]);
		expect(result.tags.map((tag) => tag.name)).toEqual(["Weapon"]);
	});

	test("making art the showcase unsets the author's previous one", async () => {
		const [first, second] = await ArtFactory.createMany(2, {
			authorId: authorId(),
		});

		await ArtRepository.update(second.id, {
			description: null,
			linkedUsers: [],
			tags: [],
			isShowcase: 1,
		});

		const result = await ArtRepository.arts().execute();
		expect(result.find((art) => art.id === first.id)?.isShowcase).toBe(false);
		expect(result.find((art) => art.id === second.id)?.isShowcase).toBe(true);
	});
});
