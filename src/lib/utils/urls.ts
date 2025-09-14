import slugify from 'slugify';
import { asset } from '$app/paths';
import type { Tables } from '$lib/server/db/tables';

export function resolveBaseUrl(url: string) {
	return new URL(url).host;
}

export function mySlugify(name: string) {
	return slugify(name, {
		lower: true,
		strict: true
	});
}

export function isCustomUrl(value: string) {
	return Number.isNaN(Number(value));
}

export function discordAvatarUrl(
	user: Pick<Tables['User'], 'discordId' | 'discordAvatar'>,
	size: 'xxxs' | 'xxs' | 'xs' | 'sm' | 'xsm' | 'md' | 'lg' = 'sm'
): string {
	if (user.discordAvatar) {
		const sizeParam = size === 'lg' ? '?size=240' : '?size=80';
		return `https://cdn.discordapp.com/avatars/${user.discordId}/${user.discordAvatar}.webp${sizeParam}`;
	}
	return asset('/img/blank.gif');
}
