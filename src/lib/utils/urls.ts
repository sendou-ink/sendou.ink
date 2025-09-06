import slugify from 'slugify';

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
