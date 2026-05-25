import TimePopover from "~/components/TimePopover";

interface MatchBannerScheduledTimeProps {
	time: Date;
}

export function MatchBannerScheduledTime({
	time,
}: MatchBannerScheduledTimeProps) {
	return (
		<TimePopover
			time={time}
			options={{
				weekday: "short",
				year: "numeric",
				month: "numeric",
				day: "numeric",
				hour: "numeric",
				minute: "numeric",
			}}
			className="font-semi-bold"
		/>
	);
}
