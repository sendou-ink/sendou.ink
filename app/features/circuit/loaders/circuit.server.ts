import { addWeeks, getDayOfYear } from "date-fns";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import { USER_SUBMITTED_IMAGE_ROOT } from "~/utils/urls";
import type {
	CircuitEvent,
	CircuitLeaderboard,
	CircuitRegion,
	CircuitSeason,
	CircuitStandingsEntry,
} from "../circuit-types";

// TODO: replace fake data with real circuit data once the schema is decided
export const loader = () => {
	const season: CircuitSeason = "SPRING";

	return {
		season,
		events: fakeEvents(),
		standings: FAKE_STANDINGS,
		featuredLeaderboard:
			FAKE_LEADERBOARDS[getDayOfYear(new Date()) % FAKE_LEADERBOARDS.length],
	};
};

const BIWEEKLY_COUNT = 12;
const PAST_BIWEEKLY_COUNT = 5;
const FIRST_BIWEEKLY_DAY = new Date(2027, 0, 9);
const BIWEEKLY_PRIZE_USD = 100;
const MAJOR_PRIZE_USD = 800;
const OFF_MODES = ["TC", "RM", "CB", "TW"] as const;
const SAME_MODE_IN_A_ROW = 3;

const SLOTS: Array<{ regions: CircuitRegion[]; hourUtc: number }> = [
	{ regions: ["EU", "NA"], hourUtc: 18 },
	{ regions: ["NA"], hourUtc: 1 },
	{ regions: ["EU", "JP", "AU", "NZ"], hourUtc: 9 },
];

const WINNERS: Array<{
	name: string;
	logoUrl: string;
	members: Array<{
		id: number;
		username: string;
		avatar: string | null;
		weaponSplId: MainWeaponId;
	}>;
}> = [
	{
		name: "los pollos mini pig treats",
		logoUrl: teamLogoUrl("img-1789184003455-hLtDLBWYyU.webp"),
		members: [
			{
				id: 36164,
				username: "karot",
				avatar: "avatar-36164-d6490d6a33f6019a0f28695b713dd909.webp",
				weaponSplId: 210,
			},
			{
				id: 23120,
				username: "micah",
				avatar: "avatar-23120-f1191c94b1da5396a06b620408017c1f.webp",
				weaponSplId: 1101,
			},
			{
				id: 13801,
				username: "soul",
				avatar: "avatar-13801-0568e775c5e210e0bd751bdcc9d0b939.webp",
				weaponSplId: 3000,
			},
			{
				id: 8413,
				username: "Mura",
				avatar: "avatar-8413-9e338f55b6e8313091612edda2851618.webp",
				weaponSplId: 61,
			},
		],
	},
	{
		name: "Takedown",
		logoUrl: teamLogoUrl("img-1792200280643-mrs5M71qr4.png"),
		members: [
			{
				id: 43408,
				username: "santo",
				avatar: "avatar-43408-516bf2e15ce1eab4e3a1f6ab3f12bb51.webp",
				weaponSplId: 1001,
			},
			{
				id: 41678,
				username: "Tufa",
				avatar: "avatar-41678-76c35498db531fb8891dc50d88509def.webp",
				weaponSplId: 210,
			},
			{
				id: 41641,
				username: "tan",
				avatar: "avatar-41641-ec29a49e9ed1078234d406f7769e28ef.webp",
				weaponSplId: 71,
			},
			{
				id: 11551,
				username: "Erito",
				avatar: "avatar-11551-c9ddde8e15f495e38c01b2c560137849.webp",
				weaponSplId: 7010,
			},
		],
	},
	{
		name: "Topi Taupe Propaganda",
		logoUrl: teamLogoUrl("img-1777163259540.webp"),
		members: [
			{
				id: 38069,
				username: "Zima",
				avatar: "avatar-38069-3a3aa558684f08e3e734a8c04e211a23.webp",
				weaponSplId: 60,
			},
			{
				id: 29813,
				username: "Fatallito",
				avatar: "avatar-29813-e8a0f4fdd367da6bd9b6586bb85bca82.webp",
				weaponSplId: 2070,
			},
			{
				id: 26392,
				username: "Daki",
				avatar: "avatar-26392-69e29cf42eee3fab46c7b50ecaf580dd.webp",
				weaponSplId: 50,
			},
			{
				id: 12484,
				username: "labiteamomooo",
				avatar: "avatar-12484-21c507ae15b5da8477bbc39b3bbee4bf.webp",
				weaponSplId: 3000,
			},
		],
	},
];

const FAKE_STANDINGS: CircuitStandingsEntry[] = [
	{
		teamName: "los pollos mini pig treats",
		logoUrl: teamLogoUrl("img-1789184003455-hLtDLBWYyU.webp"),
		points: 340,
	},
	{
		teamName: "Takedown",
		logoUrl: teamLogoUrl("img-1792200280643-mrs5M71qr4.png"),
		points: 310,
	},
	{
		teamName: "Topi Taupe Propaganda",
		logoUrl: teamLogoUrl("img-1777163259540.webp"),
		points: 255,
	},
	{
		teamName: "PxG",
		logoUrl: teamLogoUrl("img-1774047725894.webp"),
		points: 190,
	},
	{
		teamName: "Poltergeist",
		logoUrl: teamLogoUrl("img-1780634780326.webp"),
		points: 160,
	},
];

const FAKE_LEADERBOARDS: CircuitLeaderboard[] = [
	{
		type: "TC_KO_RATE",
		entries: [
			{
				id: 236,
				username: "Yeti",
				avatar: "avatar-236-41796e1cead6d24c8a06711a41ad05ee.webp",
				weaponSplId: 20,
				value: 0.71,
			},
			{
				id: 10293,
				username: "Noah",
				avatar: "avatar-10293-a3b10f757795d82eead78a028a9d4be1.webp",
				weaponSplId: 2030,
				value: 0.64,
			},
			{
				id: 5368,
				username: "Zekrom",
				avatar: "avatar-5368-33528d344cd242c52d9cb87770da80d9.webp",
				weaponSplId: 2070,
				value: 0.58,
			},
			{
				id: 32509,
				username: "彡✦✪Bonk✪✦彡",
				avatar: "avatar-32509-eb15d5957d4ca619e90a128dce649b47.webp",
				weaponSplId: 1020,
				value: 0.55,
			},
			{
				id: 36164,
				username: "karot",
				avatar: "avatar-36164-d6490d6a33f6019a0f28695b713dd909.webp",
				weaponSplId: 210,
				value: 0.5,
			},
		],
	},
	{
		type: "KD",
		entries: [
			{
				id: 43408,
				username: "santo",
				avatar: "avatar-43408-516bf2e15ce1eab4e3a1f6ab3f12bb51.webp",
				weaponSplId: 1001,
				value: 2.41,
			},
			{
				id: 23120,
				username: "micah",
				avatar: "avatar-23120-f1191c94b1da5396a06b620408017c1f.webp",
				weaponSplId: 1101,
				value: 2.12,
			},
			{
				id: 23232,
				username: "peachy",
				avatar: "avatar-23232-68f81d92a6949d2a048d36daeed1dec8.webp",
				weaponSplId: 211,
				value: 1.98,
			},
			{
				id: 38069,
				username: "Zima",
				avatar: "avatar-38069-3a3aa558684f08e3e734a8c04e211a23.webp",
				weaponSplId: 60,
				value: 1.85,
			},
			{
				id: 197,
				username: "dark",
				avatar: "avatar-197-aa896563c56f8454770cde12ea7d9256.webp",
				weaponSplId: 71,
				value: 1.77,
			},
		],
	},
];

function fakeEvents(): CircuitEvent[] {
	const biweeklies = Array.from(
		{ length: BIWEEKLY_COUNT },
		(_, i): CircuitEvent => {
			const slot = SLOTS[i % SLOTS.length];
			const isPast = i < PAST_BIWEEKLY_COUNT;

			return {
				id: i + 1,
				name: `Spring #${i + 1}`,
				isMajor: false,
				dayCount: 1,
				startsAt: atUtcHour(addWeeks(FIRST_BIWEEKLY_DAY, i * 2), slot.hourUtc),
				regions: slot.regions,
				offMode:
					OFF_MODES[Math.floor(i / SAME_MODE_IN_A_ROW) % OFF_MODES.length],
				prizeUsd: BIWEEKLY_PRIZE_USD,
				result: isPast ? fakeResult(i) : null,
			};
		},
	);

	const major: CircuitEvent = {
		id: BIWEEKLY_COUNT + 1,
		name: "Spring Major",
		isMajor: true,
		dayCount: 2,
		startsAt: atUtcHour(
			addWeeks(FIRST_BIWEEKLY_DAY, BIWEEKLY_COUNT * 2),
			SLOTS[0].hourUtc,
		),
		regions: SLOTS[0].regions,
		offMode: null,
		prizeUsd: MAJOR_PRIZE_USD,
		result: null,
	};

	return [...biweeklies, major];
}

function fakeResult(index: number): CircuitEvent["result"] {
	const winner = WINNERS[index % WINNERS.length];

	return {
		montage: {
			videoUrl: "/Paint-of-Pride-montage.mp4",
			posterUrl: "/Paint-of-Pride-montage-poster.jpg",
		},
		hasReplayCodes: index >= PAST_BIWEEKLY_COUNT - 2,
		winner: {
			name: winner.name,
			logoUrl: winner.logoUrl,
			members: winner.members,
		},
	};
}

function atUtcHour(day: Date, hourUtc: number) {
	return dateToDatabaseTimestamp(
		new Date(
			Date.UTC(day.getFullYear(), day.getMonth(), day.getDate(), hourUtc),
		),
	);
}

function teamLogoUrl(fileName: string) {
	return `${USER_SUBMITTED_IMAGE_ROOT}/${fileName}`;
}
