import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { db } from "~/db/sql";
import {
	deleteFromS3,
	uploadImmutableToS3,
} from "~/features/img-upload/s3.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import * as DiscordAvatar from "./DiscordAvatar.server";

vi.mock("~/features/img-upload/s3.server", () => ({
	uploadImmutableToS3: vi.fn(),
	deleteFromS3: vi.fn(),
}));

const DISCORD_ID = "79237403620945920";

const respondWith = (status: number) =>
	vi.stubGlobal(
		"fetch",
		vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), { status })),
	);

const avatarOf = async (id: number) =>
	(await UserRepository.findLeanById(id))?.avatar;

const users = UserFactory.pool();
const userId = () => users.id(1);
const userAsLoggingIn = () =>
	db
		.selectFrom("User")
		.select(["id", "discordAvatar", "syncedAvatarImgId"])
		.where("id", "=", userId())
		.executeTakeFirstOrThrow();

const sync = async (newHash: string) =>
	DiscordAvatar.syncForUser({
		user: await userAsLoggingIn(),
		discordId: DISCORD_ID,
		newHash,
	});

describe("DiscordAvatar.syncForUser", () => {
	beforeEach(async () => {
		await users.create(1, { discordId: DISCORD_ID, discordAvatar: "old" });
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.clearAllMocks();
	});

	test("stores the new avatar with its small copy and deletes the previous one", async () => {
		respondWith(200);

		await sync("new");

		expect(await avatarOf(userId())).toBe(`avatar-${userId()}-new.webp`);
		expect(
			vi.mocked(uploadImmutableToS3).mock.calls.map(([args]) => args.key),
		).toEqual([
			`avatar-${userId()}-new.webp`,
			`avatar-${userId()}-new-small.webp`,
		]);
		expect(deleteFromS3).toHaveBeenCalledWith([
			`avatar-${userId()}-old.webp`,
			`avatar-${userId()}-old-small.webp`,
		]);
	});

	test("clears the avatar when Discord no longer has it", async () => {
		respondWith(404);

		await sync("new");

		expect(await avatarOf(userId())).toBeNull();
		expect(uploadImmutableToS3).not.toHaveBeenCalled();
	});

	test("keeps the previous avatar when the Discord CDN fails", async () => {
		respondWith(500);

		await sync("new");

		expect(await avatarOf(userId())).toBe(`avatar-${userId()}-old.webp`);
		expect(deleteFromS3).not.toHaveBeenCalled();
	});

	test("keeps the stored files when an overlapping sync already stored the same avatar", async () => {
		respondWith(200);

		await sync("new");
		vi.mocked(deleteFromS3).mockClear();
		await sync("new");

		expect(await avatarOf(userId())).toBe(`avatar-${userId()}-new.webp`);
		expect(deleteFromS3).not.toHaveBeenCalled();
	});

	test("does nothing when the avatar is unchanged", async () => {
		respondWith(200);

		await sync("old");

		expect(fetch).not.toHaveBeenCalled();
		expect(deleteFromS3).not.toHaveBeenCalled();
	});

	test("stores an unchanged avatar that was never stored", async () => {
		respondWith(200);

		await DiscordAvatar.syncForUser({
			user: { id: userId(), discordAvatar: "old", syncedAvatarImgId: null },
			discordId: DISCORD_ID,
			newHash: "old",
		});

		expect(fetch).toHaveBeenCalled();
		expect(await avatarOf(userId())).toBe(`avatar-${userId()}-old.webp`);
	});
});
