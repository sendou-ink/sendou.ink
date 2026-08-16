import type { UserPreferences } from "#lib/db/tables-json.ts";
import type { CustomTheme } from "#lib/features/theme/theme-types.ts";
import type { UnifiedLanguageCode } from "#lib/modules/i18n/languages.ts";
import type { Role } from "#lib/modules/permissions/types.ts";

/** The logged in user as resolved once per request, shape matching `UserRepository.findLeanById`. */
export interface AuthenticatedUser {
	id: number;
	username: string;
	discordId: string;
	discordAvatar: string | null;
	customUrl: string | null;
	customAvatarUrl: string | null;
	createdAt: number | null;
	customTheme: CustomTheme | null;
	patronTier: number | null;
	languages: UnifiedLanguageCode[] | null;
	inGameName: string | null;
	preferences: UserPreferences | null;
	plusTier: number | null;
	friendCode: string | null;
	roles: Role[];
}
