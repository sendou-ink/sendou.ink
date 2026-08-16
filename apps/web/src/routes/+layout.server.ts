import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = ({ locals }) => {
	const user = locals.user;

	return {
		user: user
			? {
					id: user.id,
					username: user.username,
					discordId: user.discordId,
					discordAvatar: user.discordAvatar,
					customUrl: user.customUrl,
					customAvatarUrl: user.customAvatarUrl,
					inGameName: user.inGameName,
					friendCode: user.friendCode,
					preferences: user.preferences,
					languages: user.languages,
					plusTier: user.plusTier,
					roles: user.roles,
					createdAt: user.createdAt,
				}
			: undefined,
	};
};
