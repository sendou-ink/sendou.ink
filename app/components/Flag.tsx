import clsx from "clsx";

export function Flag({
	countryCode,
	tiny = false,
}: {
	countryCode: string;
	tiny?: boolean;
}) {
	return (
		<div
			className={clsx(`twf twf-${countryCode.toLowerCase()}`, {
				"twf-s": tiny,
			})}
			data-testid={`flag-${countryCode}`}
		/>
	);
}
