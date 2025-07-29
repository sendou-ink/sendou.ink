import { m } from '$lib/paraglide/messages';

// 1 = support
// 2 = supporter
// 3 = supporter+
export const perks = [
	{
		id: 'supportMyWork',
		tier: 1,
		name: m.common_support_perk_supportMyWork(),
		extraInfo: false
	},
	{
		id: 'adFree',
		tier: 1,
		name: m.common_support_perk_adFree(),
		extraInfo: false
	},
	{
		id: 'nameInFooter',
		tier: 1,
		name: m.common_support_perk_nameInFooter(),
		extraInfo: false
	},
	{
		id: 'privateDiscord',
		tier: 2,
		name: m.common_support_perk_privateDiscord(),
		extraInfo: true
	},
	{
		id: 'prioritySupport',
		tier: 2,
		name: m.common_support_perk_prioritySupport(),
		extraInfo: true
	},
	{
		id: 'tournamentsBeta',
		tier: 2,
		name: m.common_support_perk_tournamentsBeta(),
		extraInfo: false
	},
	{
		id: 'previewQ',
		tier: 2,
		name: m.common_support_perk_previewQ(),
		extraInfo: false
	},
	{
		id: 'userShortLink',
		tier: 2,
		name: m.common_support_perk_userShortLink(),
		extraInfo: true
	},
	{
		id: 'autoValidatePictures',
		tier: 2,
		name: m.common_support_perk_autoValidatePictures(),
		extraInfo: true
	},
	{
		id: 'customizedColorsUser',
		tier: 2,
		name: m.common_support_perk_customizedColorsUser(),
		extraInfo: false
	},
	{
		id: 'favoriteBadges',
		tier: 2,
		name: m.common_support_perk_favoriteBadges(),
		extraInfo: true
	},
	{
		id: 'customizedColorsTeam',
		tier: 2,
		name: m.common_support_perk_customizedColorsTeam(),
		extraInfo: true
	},
	{
		id: 'badge',
		tier: 2,
		name: m.common_support_perk_badge(),
		extraInfo: false
	},
	{
		id: 'discordColorRole',
		tier: 2,
		name: m.common_support_perk_discordColorRole(),
		extraInfo: true
	},
	{
		id: 'chatColor',
		tier: 2,
		name: m.common_support_perk_chatColor(),
		extraInfo: false
	},
	{
		id: 'seePlusPercentage',
		tier: 2,
		name: m.common_support_perk_seePlusPercentage(),
		extraInfo: true
	},
	{
		id: 'joinFive',
		tier: 2,
		name: m.common_support_perk_joinFive(),
		extraInfo: false
	},
	{
		id: 'joinMoreAssociations',
		tier: 2,
		name: m.common_support_perk_joinMoreAssociations(),
		extraInfo: false
	},
	{
		id: 'useBotToLogIn',
		tier: 2,
		name: m.common_support_perk_useBotToLogIn(),
		extraInfo: true
	}
] as const;
