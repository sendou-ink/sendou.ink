import type {
	LoaderFunctionArgs,
	MetaFunction,
	SerializeFrom,
} from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import clsx from "clsx";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Button, LinkButton } from "~/components/Button";
import { FormWithConfirm } from "~/components/FormWithConfirm";
import { Image, WeaponImage } from "~/components/Image";
import { Main } from "~/components/Main";
import { YouTubeEmbed } from "~/components/YouTubeEmbed";
import { EditIcon } from "~/components/icons/Edit";
import { TrashIcon } from "~/components/icons/Trash";
import { useUser } from "~/features/auth/core/user";
import { useIsMounted } from "~/hooks/useIsMounted";
import { useSearchParamState } from "~/hooks/useSearchParamState";
import { databaseTimestampToDate } from "~/utils/dates";
import { secondsToMinutes } from "~/utils/number";
import { type SendouRouteHandle, notFoundIfFalsy } from "~/utils/remix.server";
import { makeTitle } from "~/utils/strings";
import type { Unpacked } from "~/utils/types";
import {
	VODS_PAGE,
	modeImageUrl,
	navIconUrl,
	newVodPage,
	stageImageUrl,
	vodVideoPage,
} from "~/utils/urls";
import { PovUser } from "../components/VodPov";
import { findVodById } from "../queries/findVodById.server";
import type { Vod } from "../vods-types";
import { canEditVideo } from "../vods-utils";

import "../vods.css";

import { action } from "../actions/vods.$id.server";
export { action };

export const handle: SendouRouteHandle = {
	breadcrumb: ({ match }) => {
		const data = match.data as SerializeFrom<typeof loader> | undefined;

		if (!data) return [];

		return [
			{
				imgPath: navIconUrl("vods"),
				href: VODS_PAGE,
				type: "IMAGE",
			},
			{
				text: data.vod.title,
				href: vodVideoPage(data.vod.id),
				type: "TEXT",
			},
		];
	},
};

export const meta: MetaFunction = (args) => {
	const data = args.data as SerializeFrom<typeof loader> | null;

	if (!data) return [];

	return [{ title: makeTitle(data.vod.title) }];
};

export const loader = ({ params }: LoaderFunctionArgs) => {
	const vod = notFoundIfFalsy(findVodById(Number(params.id)));

	return { vod };
};

export default function VodPage() {
	const [start, setStart] = useSearchParamState({
		name: "start",
		defaultValue: 0,
		revive: Number,
	});
	const { i18n } = useTranslation();
	const isMounted = useIsMounted();
	const [autoplay, setAutoplay] = React.useState(false);
	const data = useLoaderData<typeof loader>();
	const { t } = useTranslation(["common", "vods"]);
	const user = useUser();

	return (
		<Main className="stack lg">
			<div className="stack sm">
				<YouTubeEmbed
					key={start}
					id={data.vod.youtubeId}
					start={start}
					autoplay={autoplay}
				/>
				<h2 className="text-sm">{data.vod.title}</h2>
				<div className="stack horizontal justify-between">
					<div className="stack horizontal sm items-center">
						<PovUser pov={data.vod.pov} />
						<time
							className={clsx("text-lighter text-xs", {
								invisible: !isMounted,
							})}
						>
							{isMounted
								? databaseTimestampToDate(
										data.vod.youtubeDate,
									).toLocaleDateString(i18n.language, {
										day: "numeric",
										month: "numeric",
										year: "numeric",
									})
								: "t"}
						</time>
					</div>

					{canEditVideo({
						submitterUserId: data.vod.submitterUserId,
						userId: user?.id,
						povUserId:
							typeof data.vod.pov === "string" ? undefined : data.vod.pov?.id,
					}) ? (
						<div className="stack horizontal md">
							<LinkButton
								to={newVodPage(data.vod.id)}
								size="tiny"
								testId="edit-vod-button"
								icon={<EditIcon />}
							>
								{t("common:actions.edit")}
							</LinkButton>
							<FormWithConfirm
								dialogHeading={t("vods:deleteConfirm", {
									title: data.vod.title,
								})}
							>
								<Button
									variant="minimal-destructive"
									size="tiny"
									type="submit"
									icon={<TrashIcon />}
								>
									{t("common:actions.delete")}
								</Button>
							</FormWithConfirm>
						</div>
					) : null}
				</div>
			</div>
			<div className="vods__matches">
				{data.vod.matches.map((match) => (
					<Match
						key={match.id}
						match={match}
						setStart={(newStart) => {
							setStart(newStart);
							setAutoplay(true);
							window.scrollTo(0, 0);
						}}
					/>
				))}
			</div>
		</Main>
	);
}

function Match({
	match,
	setStart,
}: {
	match: Unpacked<Vod["matches"]>;
	setStart: (start: number) => void;
}) {
	const { t } = useTranslation(["game-misc", "weapons"]);

	const weapon = match.weapons.length === 1 ? match.weapons[0] : null;
	const weapons = match.weapons.length === 8 ? match.weapons : null;

	return (
		<div className="vods__match">
			<Image
				alt=""
				path={stageImageUrl(match.stageId)}
				width={120}
				className="rounded"
			/>
			{weapon ? (
				<WeaponImage
					weaponSplId={weapon}
					variant="badge"
					width={42}
					className="vods__match__weapon"
					testId={`weapon-img-${weapon}`}
				/>
			) : null}
			<Image
				path={modeImageUrl(match.mode)}
				width={32}
				className={clsx("vods__match__mode", { cast: Boolean(weapons) })}
				alt={t(`game-misc:MODE_LONG_${match.mode}`)}
				title={t(`game-misc:MODE_LONG_${match.mode}`)}
			/>
			{weapons ? (
				<div className="stack horizontal md">
					<div className="vods__match__weapons">
						{weapons.slice(0, 4).map((weapon, i) => {
							return (
								<WeaponImage
									key={i}
									testId={`weapon-img-${weapon}-${i}`}
									weaponSplId={weapon}
									variant="badge"
									width={30}
								/>
							);
						})}
					</div>
					<div className="vods__match__weapons">
						{weapons.slice(4).map((weapon, i) => {
							const adjustedI = i + 4;
							return (
								<WeaponImage
									key={i}
									testId={`weapon-img-${weapon}-${adjustedI}`}
									weaponSplId={weapon}
									variant="badge"
									width={30}
								/>
							);
						})}
					</div>
				</div>
			) : null}
			<Button
				size="tiny"
				onClick={() => setStart(match.startsAt)}
				variant="outlined"
			>
				{secondsToMinutes(match.startsAt)}
			</Button>
		</div>
	);
}
