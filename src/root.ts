import type { AuthenticatedUser } from "~/features/auth/core/user.server";

// TODO: replace with actual root loader return type once root loader is implemented
export type RootLoaderData = {
	locale: string;
	theme: string | null;
	sidenavCollapsed: boolean;
	user?: {
		username: string;
		discordAvatar: string | null;
		discordId: string;
		id: number;
		customUrl: string | null;
		inGameName: string | null;
		friendCode: string | null;
		preferences: Record<string, unknown>;
		languages: string[];
		plusTier: number | null;
		roles: string[];
	};
	customTheme?: AuthenticatedUser["customTheme"];
	notifications?: Array<{
		id: number;
		seen: boolean;
		type: string;
		content: Record<string, unknown>;
		createdAt: number;
	}>;
	sidebar?: {
		events: Array<{
			id: number;
			name: string;
			url: string;
			logoUrl: string | null;
			startTime: number;
			type: string;
			scrimStatus?: string;
		}>;
		friends: Array<{
			id: number;
			name: string;
			discordId: string;
			discordAvatar: string | null;
			url: string;
			subtitle: string;
			badge: string;
			tournamentId: number | null;
		}>;
		streams: Array<{
			odId: string;
			odName: string;
			twitchUserName: string;
			discordAvatar: string | null;
			tier: number | null;
			tournamentId: number | null;
			upcoming: boolean;
		}>;
		savedTournamentIds: number[];
	};
};

export type LoggedInUser = NonNullable<RootLoaderData["user"]>;
