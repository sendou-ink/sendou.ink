// .server because these are dangerous to use on client due to hydration mismatches
// (Node.js and browser can display different language depending on implementation)

export function translatedCountry({
	language,
	countryCode,
}: {
	language: string;
	countryCode: string;
}) {
	return new Intl.DisplayNames([language], { type: "region" }).of(countryCode);
}
