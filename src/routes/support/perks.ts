import { m } from '$lib/paraglide/messages';

// 1 = support
// 2 = supporter
// 3 = supporter+
export const perks = [
	{
		id: 'supportMyWork',
		tier: 1,
		name: m.common_support_perk_supportMyWork(),
		extraInfo: null
	},
	{
		id: 'adFree',
		tier: 1,
		name: m.common_support_perk_adFree(),
		extraInfo: null
	},
	{
		id: 'nameInFooter',
		tier: 1,
		name: m.common_support_perk_nameInFooter(),
		extraInfo: null
	},
	{
		id: 'privateDiscord',
		tier: 2,
		name: m.common_support_perk_privateDiscord(),
		extraInfo: m.common_support_perk_privateDiscord_extra()
	},
	{
		id: 'prioritySupport',
		tier: 2,
		name: m.common_support_perk_prioritySupport(),
		extraInfo: m.common_support_perk_prioritySupport_extra()
	},
	{
		id: 'tournamentsBeta',
		tier: 2,
		name: m.common_support_perk_tournamentsBeta(),
		extraInfo: null
	},
	{
		id: 'previewQ',
		tier: 2,
		name: m.common_support_perk_previewQ(),
		extraInfo: null
	},
	{
		id: 'userShortLink',
		tier: 2,
		name: m.common_support_perk_userShortLink(),
		extraInfo: m.common_support_perk_userShortLink_extra()
	},
	{
		id: 'autoValidatePictures',
		tier: 2,
		name: m.common_support_perk_autoValidatePictures(),
		extraInfo: m.common_support_perk_autoValidatePictures_extra()
	},
	{
		id: 'customizedColorsUser',
		tier: 2,
		name: m.common_support_perk_customizedColorsUser(),
		extraInfo: null
	},
	{
		id: 'favoriteBadges',
		tier: 2,
		name: m.common_support_perk_favoriteBadges(),
		extraInfo: m.common_support_perk_favoriteBadges_extra()
	},
	{
		id: 'customizedColorsTeam',
		tier: 2,
		name: m.common_support_perk_customizedColorsTeam(),
		extraInfo: m.common_support_perk_customizedColorsTeam_extra()
	},
	{
		id: 'badge',
		tier: 2,
		name: m.common_support_perk_badge(),
		extraInfo: null
	},
	{
		id: 'discordColorRole',
		tier: 2,
		name: m.common_support_perk_discordColorRole(),
		extraInfo: m.common_support_perk_discordColorRole_extra()
	},
	{
		id: 'chatColor',
		tier: 2,
		name: m.common_support_perk_chatColor(),
		extraInfo: null
	},
	{
		id: 'seePlusPercentage',
		tier: 2,
		name: m.common_support_perk_seePlusPercentage(),
		extraInfo: m.common_support_perk_seePlusPercentage_extra()
	},
	{
		id: 'joinFive',
		tier: 2,
		name: m.common_support_perk_joinFive(),
		extraInfo: null
	},
	{
		id: 'joinMoreAssociations',
		tier: 2,
		name: m.common_support_perk_joinMoreAssociations(),
		extraInfo: null
	},
	{
		id: 'useBotToLogIn',
		tier: 2,
		name: m.common_support_perk_useBotToLogIn(),
		extraInfo: m.common_support_perk_useBotToLogIn_extra()
	}
] as const;
