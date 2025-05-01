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
				teamName: string;
				tournamentTeamId: number;
			}
	  >
	| NotificationItem<
			"TO_BRACKET_STARTED",
			{
				tournamentId: number;
				bracketIdx: number;
				bracketName: string;
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
	| NotificationItem<
			"TO_TEST_CREATED",
			{
				tournamentId: number;
				tournamentName: string;
			}
	  >
	| NotificationItem<"BADGE_ADDED", { badgeName: string; badgeId: number }>
	| NotificationItem<
			"BADGE_MANAGER_ADDED",
			{ badgeName: string; badgeId: number }
	  >
	| NotificationItem<
			"PLUS_VOTING_STARTED",
			{
				seasonNth: number;
			}
	  >
	| NotificationItem<"PLUS_SUGGESTION_ADDED", { tier: number }>
	| NotificationItem<
			"TAGGED_TO_ART",
			{ adderUsername: string; adderDiscordId: string; artId: number }
	  >
	| NotificationItem<"SEASON_STARTED", { seasonNth: number }>
	| NotificationItem<"SCRIM_NEW_REQUEST", { fromUsername: string }>
	| NotificationItem<"SCRIM_SCHEDULED", { id: number; timeString: string }>;

type NotificationItem<
	T extends string,
	M extends Record<string, number | string> | undefined = undefined,
> = M extends undefined
	? { type: T; pictureUrl?: string }
	: { type: T; meta: M; pictureUrl?: string };
