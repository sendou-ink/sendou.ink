export type Notification =
	| NotificationItem<
			"SQ_ADDED_TO_GROUP",
			{
				adderUsername: string;
			}
	  >
	| NotificationItem<
			"SQ_NEW_MATCH",
			{
				matchId: number;
			}
	  >
	| NotificationItem<
			"TO_ADDED_TO_TEAM",
			{
				tournamentId: number;
				tournamentName: string;
				adderUsername: string;
			}
	  >
	| NotificationItem<
			"TO_BRACKET_STARTED",
			{
				tournamentId: number;
				bracketIdx: number;
				tournamentName: string;
			}
	  >
	| NotificationItem<
			"TO_CHECK_IN_OPENED",
			{
				tournamentId: number;
				tournamentName: string;
			}
	  >
	| NotificationItem<"BADGE_ADDED", { badgeName: string }>
	| NotificationItem<"PLUS_VOTING_STARTED">
	| NotificationItem<"PLUS_SUGGESTION_ADDED", { tier: number }>
	| NotificationItem<"TAGGED_TO_ART">
	| NotificationItem<"SEASON_STARTED", { seasonNth: number }>;

type NotificationItem<
	T extends string,
	M extends Record<string, number | string> | undefined = undefined,
> = {
	type: T;
	meta?: M & { pictureUrl?: string };
};
