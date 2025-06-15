import { Divider } from "~/components/Divider";
import { Image } from "~/components/Image";
import { Main } from "~/components/Main";
import { list } from "~/features/mmr/core/Seasons";
import { navIconUrl, tierImageUrl } from "~/utils/urls";

// this page is not accessible in production, just used to generate images for social media

export default function GenerateImages() {
	return (
		<Main className="stack lg">
			<h1>Generate Images</h1>
			<Divider />
			<SendouQSeason />
		</Main>
	);
}

const season = list.at(-1)!;

function SendouQSeason() {
	return (
		<div className="text-center stack lg">
			<div>
				<h2 style={{ fontSize: "2rem" }}>Season {season.nth}</h2>
				<div className="font-semi-bold text-md italic">
					{season.starts.toLocaleDateString("en-US", {
						month: "long",
						day: "numeric",
						year: "numeric",
					})}{" "}
					-{" "}
					{season.ends.toLocaleDateString("en-US", {
						month: "long",
						day: "numeric",
						year: "numeric",
					})}
				</div>
			</div>

			<div
				style={{
					display: "grid",
					gridTemplateColumns: "repeat(3, 1fr)",
					gap: "1rem",
					placeItems: "center",
				}}
			>
				<InfoSquare title="Gain Plus Server access">
					<Image width={124} height={124} path={navIconUrl("plus")} alt="" />
				</InfoSquare>
				<InfoSquare title="Compete in Season Finale">
					<Image width={124} height={124} path={navIconUrl("sendouq")} alt="" />
				</InfoSquare>
				<InfoSquare title="Rank Up to Leviathan">
					<Image
						width={124}
						height={124}
						path={tierImageUrl("LEVIATHAN")}
						alt=""
					/>
				</InfoSquare>
			</div>

			<Divider smallText className="font-bold text-xs">
				EVENTS
			</Divider>

			<EventSchedule
				name="In The Zone 44"
				imgId="itz"
				date={new Date("2025-07-05T12:00:00Z")}
			/>

			<EventSchedule
				name="In The Zone 45"
				imgId="itz"
				date={new Date("2025-08-16T12:00:00Z")}
			/>

			<EventSchedule
				name="Season Finale"
				imgId="sf"
				date={new Date("2025-08-30T12:00:00Z")}
			/>

			<div className="text-xs font-semi-bold mt-6">
				Check all ranked tournaments on the calendar!
			</div>
		</div>
	);
}

function InfoSquare({
	title,
	children,
}: { title: string; children: React.ReactNode }) {
	return (
		<div className="font-semi-bold">
			{title}
			<div
				className="bg-lighter"
				style={{
					width: "12rem",
					height: "12rem",
					borderRadius: "var(--rounded)",
					marginTop: "1rem",
					display: "grid",
					placeItems: "center",
					borderColor: "var(--border)",
					borderWidth: "2px",
					borderStyle: "solid",
				}}
			>
				{children}
			</div>
		</div>
	);
}

function EventSchedule({
	name,
	date,
	imgId,
}: { name: string; date: Date; imgId: string }) {
	return (
		<div className="stack md horizontal items-center mx-auto">
			<img
				alt=""
				src={`http://localhost:5173/static-assets/img/tournament-logos/${imgId}.png`}
				style={{
					width: "4rem",
					height: "4rem",
					borderRadius: "100%",
				}}
			/>
			<div className="stack items-start">
				<div className="font-semi-bold text-lg">{name}</div>
				<div className="text-sm">
					{date.toLocaleDateString("en-US", {
						month: "long",
						day: "numeric",
						year: "numeric",
					})}
				</div>
			</div>
		</div>
	);
}
