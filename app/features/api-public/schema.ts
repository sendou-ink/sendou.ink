import type { DataTypes, ValueToArray } from "~/modules/brackets-manager/types";

/** GET /api/user/{userId|discordId} */

export interface GetUserResponse {
	id: number;
	/**
	 * @example "Sendou"
	 */
	name: string;
	/**
	 * @example "79237403620945920"
	 */
	discordId: string;
	/**
	 * @example "https://sendou.ink/u/sendou"
	 */
	url: string;
	/**
	 * @example "https://cdn.discordapp.com/avatars/79237403620945920/6fc41a44b069a0d2152ac06d1e496c6c.png"
	 */
	avatarUrl: string | null;
	/**
	 * @example "FI"
	 */
	country: string | null;
	socials: {
		twitch: string | null;
		// @deprecated
		twitter: null;
		battlefy: string | null;
		bsky: string | null;
	};
	plusServerTier: 1 | 2 | 3 | null;
	weaponPool: Array<ProfileWeapon>;
	badges: Array<Badge>;
	peakXp: number | null;
}

/** GET /api/calendar/{year}/{week} */

export type GetCalendarWeekResponse = Array<{
	/**
	 * @example "In The Zone 30"
	 */
	name: string;
	tournamentId: number | null;
	/**
	 * @example "https://sendou.ink/to/9/brackets"
	 */
	tournamentUrl: string | null;
	/**
	 * @example "2024-01-12T20:00:00.000Z"
	 */
	startTime: string;
}>;

/** GET /api/tournament/{tournamentId} */

export interface GetTournamentResponse {
	/**
	 * @example "In The Zone 30"
	 */
	name: string;
	/**
	 * @example "https://sendou.ink/to/9/brackets"
	 */
	url: string;
	/**
	 * @example "https://sendou.ink/static-assets/img/tournament-logos/itz.png"
	 */
	logoUrl: string | null;
	/**
	 * @example "2024-01-12T20:00:00.000Z"
	 */
	startTime: string;
	teams: {
		registeredCount: number;
		checkedInCount: number;
	};
	brackets: TournamentBracket[];
	organizationId: number | null;
	/** Has the tournament concluded (results added to user profiles & no editing possible anymore) */
	isFinalized: boolean;
}

/** GET /api/tournament/{tournamentId}/teams */

export type GetTournamentTeamsResponse = Array<{
	id: number;
	/**
	 * @example "Team Olive"
	 */
	name: string;
	/**
	 * @example "2024-01-12T20:00:00.000Z"
	 */
	registeredAt: string;
	checkedIn: boolean;
	/**
	 * URL for the tournament team page.
	 *
	 * @example "https://sendou.ink/to/9/teams/327"
	 */
	url: string;
	/**
	 * URL for the global team page.
	 *
	 * @example "https://sendou.ink/t/moonlight"
	 */
	teamPageUrl: string | null;
	/**
	 * @example "https://sendou.nyc3.cdn.digitaloceanspaces.com/pickup-logo-uReSb1b1XS3TWGLCKMDUD-1719054364813.webp"
	 */
	logoUrl: string | null;
	seed: number | null;
	mapPool: Array<StageWithMode> | null;
	/**
	 *  Seeding power is a non-resetting MMR value that is used for sendou.ink's autoseeding capabilities.
	 *  It is calculated as the average of the team's members' seeding power.
	 *  Ranked and unranked tournaments contribute to different seeding power values.
	 */
	seedingPower: {
		ranked: number | null;
		unranked: number | null;
	};
	members: Array<{
		userId: number;
		/**
		 * @example "Sendou"
		 */
		name: string;
		/**
		 * @example "79237403620945920"
		 */
		discordId: string;
		/**
		 * @example "sendouc"
		 */
		battlefy: string | null;
		/**
		 * @example "https://cdn.discordapp.com/avatars/79237403620945920/6fc41a44b069a0d2152ac06d1e496c6c.png"
		 */
		avatarUrl: string | null;
		captain: boolean;
		/**
		 * Splatoon 3 splashtag name & ID. Notice the value returned is the player's set name at the time of the tournament.
		 * Only available for tournaments with the "Require IGN's" option enabled.
		 *
		 * @example "Sendou#2955"
		 */
		inGameName: string | null;
		/**
		 *  Switch friend code used for identification purposes.
		 *
		 * @example "1234-5678-9101"
		 */
		friendCode: string;
		/**
		 * @example "2024-01-12T20:00:00.000Z"
		 */
		joinedAt: string;
	}>;
}>;

/** GET /api/tournament/{tournamentId}/casted */

export interface GetCastedTournamentMatchesResponse {
	/*
	 * Matches that are currently being played and casted. Note: at the moment only one match can be casted at a time but this is an array for future proofing.
	 */
	current: Array<{
		matchId: number;
		channel: TournamentCastChannel;
	}>;
	/*
	 * Matches that are locked to be casted.
	 */
	future: Array<{
		matchId: number;
		channel: TournamentCastChannel | null;
	}>;
}

type TournamentCastChannel = {
	type: "TWITCH";
	/**
	 * @example "iplsplatoon"
	 */
	channelId: string;
};

/** GET /api/tournament-match/{matchId} */

export interface GetTournamentMatchResponse {
	teamOne: TournamentMatchTeam | null;
	teamTwo: TournamentMatchTeam | null;
	/**
	 * Name of the bracket this match belongs to.
	 *
	 * @example "Alpha Bracket"
	 */
	bracketName: string | null;
	/**
	 * Name of the round this match belongs to.
	 *
	 * @example "Grand Finals"
	 */
	roundName: string | null;
	mapList: Array<MapListMap> | null;
	/**
	 * @example "https://sendou.ink/to/9/matches/695"
	 */
	url: string;
}

/** GET /api/tournament/{tournamentId}/brackets/{bracketIndex} */

export interface GetTournamentBracketResponse {
	data: TournamentBracketData;
	teams: Array<{
		id: number;
		checkedIn: boolean;
	}>;
	meta: {
		/** How many teams per group? (round robin only) */
		teamsPerGroup?: number;
		/** How many groups? (swiss only) */
		groupCount?: number;
		/** How many rounds? (swiss only) */
		roundCount?: number;
	};
}

/** GET /api/tournament/{tournamentId}/brackets/{bracketIndex}/standings */

export interface GetTournamentBracketStandingsResponse {
	standings: Array<{
		tournamentTeamId: number;
		placement: number;
		stats?: {
			setWins: number;
			setLosses: number;
			mapWins: number;
			mapLosses: number;
			points: number;
			winsAgainstTied: number;
			lossesAgainstTied?: number;
			buchholzSets?: number;
			buchholzMaps?: number;
		};
	}>;
}

/** GET /api/org/{organizationId} */

export interface GetTournamentOrganizationResponse {
	id: number;
	/**
	 * @example "Dapple Productions"
	 */
	name: string;
	description: string | null;
	/**
	 * @example "https://sendou.ink/org/dapple-productions"
	 */
	url: string;
	/**
	 * @example "https://sendou.nyc3.cdn.digitaloceanspaces.com/gBn45bbUMXM6359ZDQS5_-1722059432073.webp"
	 */
	logoUrl: string | null;
	members: Array<TournamentOrganizationMember>;
	socialLinkUrls: Array<string>;
}

interface TournamentOrganizationMember {
	userId: number;
	/**
	 * @example "Sendou"
	 */
	name: string;
	/**
	 * @example "79237403620945920"
	 */
	discordId: string;
	role: "ADMIN" | "MEMBER" | "ORGANIZER" | "STREAMER";
	roleDisplayName: string | null;
}

/* ----------------------------------------- */

type Weapon = {
	id: number;
	name: string;
};

type ProfileWeapon = Weapon & { isFiveStar: boolean };

type Badge = {
	/**
	 * @example "Monday Afterparty"
	 */
	name: string;
	count: number;
	/**
	 * @example "https://sendou.ink/static-assets/badges/monday.png"
	 */
	imageUrl: string;
	/**
	 * @example "https://sendou.ink/static-assets/badges/monday.gif"
	 */
	gifUrl: string;
};

type ModeShort = "TW" | "SZ" | "TC" | "RM" | "CB";
type Stage = {
	id: number;
	name: string;
};

type StageWithMode = {
	mode: ModeShort;
	stage: Stage;
};

type MapListMap = {
	map: StageWithMode;
	/**
	 * One of the following:
	 * - id of the team that picked the map
	 * - "DEFAULT" if it was a default map, something went wrong with the algorithm typically
	 * - "TIEBREAKER" if it was a tiebreaker map (selected by the TO)
	 * - "BOTH" both teams picked the map
	 * - "TO" if it was a TO pick (from predefined maplist)
	 * - "COUNTERPICK" if it was a counterpick
	 */
	source: number | "DEFAULT" | "TIEBREAKER" | "BOTH" | "TO" | "COUNTERPICK";
	winnerTeamId: number | null;
	participatedUserIds: Array<number> | null;
};

type TournamentMatchTeam = {
	id: number;
	score: number;
};

type TournamentBracket = {
	type: "double_elimination" | "single_elimination" | "round_robin" | "swiss";
	name: string;
};

// TODO: use a better documented type here
type TournamentBracketData = ValueToArray<DataTypes>;
