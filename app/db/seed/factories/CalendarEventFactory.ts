import * as CalendarRepository from "~/features/calendar/CalendarRepository.server";
import { tags } from "~/features/calendar/calendar-constants";
import { databaseTimestampNow } from "~/utils/dates";
import { defineFactory } from "../core/defineFactory";
import { faker } from "../core/faker";
import * as ImageFactory from "./ImageFactory";

type EventTags = NonNullable<
	Parameters<typeof CalendarRepository.insert>[0]["tags"]
>;

type InsertArgs = Omit<
	Parameters<typeof CalendarRepository.insert>[0],
	"isFullTournament" | "bracketProgression" | "mapPickingStyle"
>;

/**
 * What every calendar event is defaulted to, tournaments included — a tournament is
 * a calendar event with one attached, see `TournamentFactory`.
 */
export const eventDefaults = () => ({
	name: faker.company.name(),
	description: faker.number.float(1) < 0.4 ? faker.lorem.paragraph() : null,
	discordInviteCode: faker.number.float(1) < 0.3 ? faker.lorem.word() : null,
	bracketUrl: faker.internet.url(),
	organizationId: null,
	tags: fakeTags(),
	badges: [],
	rules: null,
	startTimes: [databaseTimestampNow()],
});

function fakeTags(): EventTags | null {
	if (faker.number.float(1) < 0.5) return null;

	return faker.helpers.arrayElements(Object.keys(tags) as EventTags, {
		min: 1,
		max: 3,
	});
}

type Options = {
	/** Gives the event a logo, submitted by its author the way one is in production. */
	hasAvatar?: boolean;
};

export const { create } = defineFactory({
	defaults: eventDefaults,
	insert: async ({ hasAvatar, ...args }: InsertArgs & Options) => {
		const avatarImgId = hasAvatar
			? (
					await ImageFactory.create(
						{ submitterUserId: args.authorId },
						{ isValidated: true },
					)
				).id
			: args.avatarImgId;

		const { eventId } = await CalendarRepository.insert({
			...args,
			avatarImgId,
			isFullTournament: false,
			bracketProgression: null,
			// only read for events with a tournament of their own
			mapPickingStyle: "AUTO_ALL",
		});

		return { id: eventId };
	},
});
