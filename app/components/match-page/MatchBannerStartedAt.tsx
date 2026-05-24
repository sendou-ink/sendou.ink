import { LocaleTime } from "~/components/LocaleTime";

interface MatchBannerStartedAtProps {
	time: Date;
}

export function MatchBannerStartedAt({ time }: MatchBannerStartedAtProps) {
	return (
		<LocaleTime
			date={time}
			options={{
				month: "numeric",
				year: "2-digit",
				day: "numeric",
				hour: "numeric",
				minute: "numeric",
			}}
			className="text-lighter font-semi-bold"
			inline
		/>
	);
}
