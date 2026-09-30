import { beforeEach, describe, expect, test } from "vitest";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import * as VodFactory from "~/db/seed/factories/VodFactory";
import { jsonBuildObject, jsonObjectFrom } from "~/utils/kysely.server";
import { db } from "./sql";

const users = UserFactory.pool();

const publishedOn = (day: number) => ({ day, month: 0, year: 2024 });
const noonUtc = (day: number) => new Date(Date.UTC(2024, 0, day, 12));

describe("timestamp columns", () => {
	beforeEach(async () => {
		await users.create(1);
		for (const day of [1, 2, 3]) {
			await VodFactory.create({
				submitterUserId: users.id(1),
				date: publishedOn(day),
			});
		}
	});

	test("read back as a Date", async () => {
		const rows = await db
			.selectFrom("Video")
			.select("Video.youtubePublishedAt")
			.orderBy("Video.youtubePublishedAt", "asc")
			.execute();

		expect(rows.map((row) => row.youtubePublishedAt)).toEqual(
			[1, 2, 3].map(noonUtc),
		);
	});

	test("a Date parameter compares as unix seconds", async () => {
		const rows = await db
			.selectFrom("Video")
			.select("Video.youtubePublishedAt")
			.where("Video.youtubePublishedAt", ">", noonUtc(2))
			.execute();

		expect(rows.map((row) => row.youtubePublishedAt)).toEqual([noonUtc(3)]);
	});

	test.each([
		{
			why: "jsonObjectFrom",
			select: () =>
				db
					.selectNoFrom((eb) =>
						jsonObjectFrom(
							eb.selectFrom("Video").select("Video.youtubePublishedAt"),
						).as("video"),
					)
					.execute(),
		},
		{
			why: "jsonBuildObject",
			select: () =>
				db
					.selectFrom("Video")
					.select((eb) =>
						jsonBuildObject({
							publishedAt: eb.ref("Video.youtubePublishedAt"),
						}).as("video"),
					)
					.execute(),
		},
	])("inside nested JSON throws ($why)", ({ select }) => {
		expect(select).toThrow("timestamp");
	});
});
