export const PLUS_UPVOTE = 1;
export const PLUS_DOWNVOTE = -1;

export const PLUS_VOTING_CRITERIA = {
	1: {
		passPercentage: 60,
		failPercentage: 40,
		quota: 50,
	},
	2: {
		passPercentage: 60,
		failPercentage: 40,
		quota: 75,
	},
	3: {
		passPercentage: 60,
		failPercentage: 40,
		quota: 150,
	},
} as const;
