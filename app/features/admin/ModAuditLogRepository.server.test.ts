import { add, sub } from "date-fns";
import { beforeEach, describe, expect, test } from "vitest";
import { backdate } from "~/db/seed/core/backdate";
import * as SQGroupFactory from "~/db/seed/factories/SQGroupFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { db } from "~/db/sql";
import * as Seasons from "~/features/mmr/core/Seasons";
import * as SQGroupRepository from "~/features/sendouq/SQGroupRepository.server";
import { withUserId } from "~/utils/Test";
import * as ModAuditLogRepository from "./ModAuditLogRepository.server";

const users = UserFactory.pool();
const authorId = () => users.id(1);

describe("ModAuditLogRepository.findSeasonByUserId", () => {
	const season = Seasons.currentOrPrevious()!;
	let groupId: number;

	beforeEach(async () => {
		await users.create(1);
		groupId = (await SQGroupFactory.create({ memberUserIds: [authorId()] })).id;
	});

	const writePublicNote = async (value: string | null, writtenAt: Date) => {
		await withUserId(authorId(), () =>
			SQGroupRepository.updateOwnMemberNote({ groupId, value }),
		);

		const latest = await db
			.selectFrom("ModAuditLog")
			.select("id")
			.orderBy("id", "desc")
			.executeTakeFirst();
		if (latest) {
			await backdate("ModAuditLog", latest.id, { createdAt: writtenAt });
		}
	};

	const findSeasonPublicNotes = () =>
		ModAuditLogRepository.findSeasonByUserId({
			userId: authorId(),
			season: season.nth,
			type: "SENDOUQ_PUBLIC_NOTE",
		});

	test("returns the public notes written during the season, newest first", async () => {
		await writePublicNote("first", add(season.starts, { days: 1 }));
		await writePublicNote("second", add(season.starts, { days: 2 }));

		const notes = await findSeasonPublicNotes();

		expect(notes.map((note) => note.text)).toEqual(["second", "first"]);
	});

	test("excludes public notes written outside the season", async () => {
		await writePublicNote("before", sub(season.starts, { days: 1 }));

		expect(await findSeasonPublicNotes()).toEqual([]);
	});

	test("does not log clearing the public note", async () => {
		await writePublicNote(null, add(season.starts, { days: 1 }));

		expect(await findSeasonPublicNotes()).toEqual([]);
	});
});
