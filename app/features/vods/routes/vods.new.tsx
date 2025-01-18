import { getLocalTimeZone, today } from "@internationalized/date";
import {
	type ActionFunction,
	type LoaderFunctionArgs,
	redirect,
} from "@remix-run/node";
import { Form, useLoaderData } from "@remix-run/react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { Alert } from "~/components/Alert";
import { Button } from "~/components/Button";
import { WeaponCombobox } from "~/components/Combobox";
import { Input } from "~/components/Input";
import { Label } from "~/components/Label";
import { Main } from "~/components/Main";
import { SubmitButton } from "~/components/SubmitButton";
import { UserSearch } from "~/components/UserSearch";
import { YouTubeEmbed } from "~/components/YouTubeEmbed";
import type { Video, VideoMatch } from "~/db/types";
import { useUser } from "~/features/auth/core/user";
import { requireUser } from "~/features/auth/core/user.server";
import {
	type MainWeaponId,
	type StageId,
	stageIds,
} from "~/modules/in-game-lists";
import { modesShort } from "~/modules/in-game-lists/modes";
import { secondsToMinutesNumberTuple } from "~/utils/number";
import {
	type SendouRouteHandle,
	notFoundIfFalsy,
	parseRequestPayload,
} from "~/utils/remix.server";
import { vodVideoPage } from "~/utils/urls";
import { actualNumber, id } from "~/utils/zod";
import { DatePicker } from "../../../components/DatePicker";
import { createVod, updateVodByReplacing } from "../queries/createVod.server";
import { findVodById } from "../queries/findVodById.server";
import { VOD, videoMatchTypes } from "../vods-constants";
import { videoInputSchema } from "../vods-schemas";
import type { VideoBeingAdded, VideoMatchBeingAdded } from "../vods-types";
import { canAddVideo, canEditVideo, vodToVideoBeingAdded } from "../vods-utils";

export const handle: SendouRouteHandle = {
	i18n: ["vods", "calendar"],
};

export const action: ActionFunction = async ({ request }) => {
	const user = await requireUser(request);
	const data = await parseRequestPayload({
		request,
		schema: videoInputSchema,
	});

	if (!canAddVideo(user)) {
		throw new Response(null, { status: 401 });
	}

	let video: Video;
	if (data.vodToEditId) {
		const vod = notFoundIfFalsy(findVodById(data.vodToEditId));

		if (
			!canEditVideo({
				userId: user.id,
				submitterUserId: vod.submitterUserId,
				povUserId: typeof vod.pov === "string" ? undefined : vod.pov?.id,
			})
		) {
			throw new Response("no permissions to edit this vod", { status: 401 });
		}

		video = updateVodByReplacing({
			...data.video,
			submitterUserId: user.id,
			isValidated: true,
			id: data.vodToEditId,
		});
	} else {
		video = createVod({
			...data.video,
			submitterUserId: user.id,
			isValidated: true,
		});
	}

	throw redirect(vodVideoPage(video.id));
};

const newVodLoaderParamsSchema = z.object({
	vod: z.preprocess(actualNumber, id),
});

export const loader = async ({ request }: LoaderFunctionArgs) => {
	const user = await requireUser(request);

	const url = new URL(request.url);
	const params = newVodLoaderParamsSchema.safeParse(
		Object.fromEntries(url.searchParams),
	);

	if (!params.success) {
		return { vodToEdit: null };
	}

	const vod = notFoundIfFalsy(findVodById(params.data.vod));
	const vodToEdit = vodToVideoBeingAdded(vod);

	if (
		!canEditVideo({
			submitterUserId: vod.submitterUserId,
			userId: user.id,
			povUserId: vodToEdit.povUserId,
		})
	) {
		return { vodToEdit: null };
	}

	return { vodToEdit, vodToEditId: vod.id };
};

export default function NewVodPage() {
	const data = useLoaderData<typeof loader>();
	const { t } = useTranslation(["vods", "common"]);
	const [video, setVideo] = React.useState<VideoBeingAdded>(
		data.vodToEdit ?? {
			type: "TOURNAMENT",
			matches: [newMatch()],
			youtubeId: "",
			title: "",
			date: null, // xxx: not set anywhere atm
		},
	);
	const user = useUser();

	if (!user || !user.isVideoAdder) {
		return (
			<Main className="stack items-center">
				<Alert variation="WARNING">{t("vods:gainPerms")}</Alert>
			</Main>
		);
	}

	return (
		<Form method="post">
			<input type="hidden" name="video" value={JSON.stringify(video)} />
			{data.vodToEdit ? (
				<input type="hidden" name="vodToEditId" value={data.vodToEditId} />
			) : null}
			<Main halfWidth className="stack md">
				<div>
					<Label required htmlFor="url">
						{t("vods:forms.title.youtubeUrl")}
					</Label>
					<Input
						id="url"
						defaultValue={
							data.vodToEdit && video.youtubeId
								? `https://www.youtube.com/watch?v=${video.youtubeId}`
								: undefined
						}
						onChange={(e) =>
							setVideo({
								...video,
								youtubeId: extractYoutubeIdFromVideoUrl(e.target.value),
							})
						}
						placeholder="https://www.youtube.com/watch?v=-dQ6JsVIKdY"
						required
					/>
				</div>

				<div>
					<Label required htmlFor="title">
						{t("vods:forms.title.videoTitle")}
					</Label>
					<Input
						id="title"
						value={video.title}
						onChange={(e) =>
							setVideo({
								...video,
								title: e.target.value,
							})
						}
						placeholder="[SCL 47] (Grand Finals) Team Olive vs. Kraken Paradise"
						minLength={VOD.TITLE_MIN_LENGTH}
						maxLength={VOD.TITLE_MAX_LENGTH}
						required
					/>
				</div>

				<DatePicker
					label={t("vods:forms.title.videoDate")}
					isRequired
					maxValue={today(getLocalTimeZone())}
				/>

				{video.youtubeId ? (
					<>
						<YouTubeEmbed id={video.youtubeId} />
					</>
				) : null}

				<div>
					<Label required htmlFor="type">
						{t("vods:forms.title.type")}
					</Label>
					<select
						id="type"
						name="type"
						value={video.type}
						onChange={(e) =>
							setVideo({ ...video, type: e.target.value as Video["type"] })
						}
					>
						{videoMatchTypes.map((type) => {
							return (
								<option key={type} value={type}>
									{t(`vods:type.${type}`)}
								</option>
							);
						})}
					</select>
				</div>

				{video.type !== "CAST" ? (
					<TransformingPlayerInput
						match={video}
						onChange={(newUser) => setVideo({ ...video, ...newUser })}
						toggleInputType={() => {
							const isPlainInput = typeof video.povUserName === "string";

							if (isPlainInput) {
								setVideo({
									...video,
									povUserId: undefined,
									povUserName: undefined,
								});
							} else {
								setVideo({
									...video,
									povUserId: undefined,
									povUserName: "",
								});
							}
						}}
					/>
				) : null}

				{video.matches.map((match, i) => {
					return (
						<Match
							key={i}
							match={match}
							number={i + 1}
							onChange={(newMatch) => {
								setVideo({
									...video,
									matches: video.matches.map((match, j) =>
										i === j ? newMatch : match,
									),
								});
							}}
							type={video.type}
						/>
					);
				})}
				<div className="stack horizontal md justify-end">
					<Button
						className="self-start mt-4"
						variant="outlined"
						onClick={() =>
							setVideo({
								...video,
								matches: [...video.matches, newMatch(video.matches)],
							})
						}
						size="tiny"
						testId="add-match"
					>
						{t("vods:forms.action.addMatch")}
					</Button>
					{video.matches.length > 1 ? (
						<Button
							className="self-start mt-4"
							variant="destructive"
							onClick={() =>
								setVideo({
									...video,
									matches: video.matches.filter(
										(_, i) => i !== video.matches.length - 1,
									),
								})
							}
							size="tiny"
						>
							{t("vods:forms.action.deleteMatch")}
						</Button>
					) : null}
				</div>

				<div className="stack items-start">
					<SubmitButton size="big">{t("common:actions.submit")}</SubmitButton>
				</div>
			</Main>
		</Form>
	);
}

function newMatch(matches?: VideoBeingAdded["matches"]): VideoMatchBeingAdded {
	const previousMatch = matches?.[matches.length - 1];
	if (!previousMatch) {
		return { weapons: [], mode: "SZ", stageId: 1, startsAt: 0 };
	}

	return {
		weapons: previousMatch.weapons,
		mode: "SZ",
		stageId: 1,
		startsAt: 0,
	};
}

function extractYoutubeIdFromVideoUrl(url: string): string {
	const match = url.match(
		/^(?:https?:\/\/)?(?:www\.)?(?:youtube\.com|youtu\.be)\/(?:watch\?v=)?(.+)$/,
	);

	const found = match?.[1];
	if (!found) return "";

	const withoutSearchParams = found.split("&")[0];

	return withoutSearchParams;
}

function TransformingPlayerInput({
	match,
	onChange,
	toggleInputType,
}: {
	match: Pick<VideoBeingAdded, "povUserId" | "povUserName">;
	onChange: (match: Pick<VideoBeingAdded, "povUserId" | "povUserName">) => void;
	toggleInputType: () => void;
}) {
	const { t } = useTranslation(["calendar", "vods"]);

	// if null or number we render combobox
	const asPlainInput = typeof match.povUserName === "string";

	return (
		<div>
			<div className="stack horizontal md items-center mb-1">
				<Label required htmlFor="pov" className="mb-0">
					{t("vods:forms.title.pov")}
				</Label>
				<Button
					size="tiny"
					variant="minimal"
					onClick={toggleInputType}
					className="outline-theme"
				>
					{asPlainInput
						? t("calendar:forms.team.player.addAsUser")
						: t("calendar:forms.team.player.addAsText")}
				</Button>
			</div>
			{asPlainInput ? (
				<input
					id="pov"
					value={match.povUserName ?? ""}
					onChange={(e) => onChange({ ...match, povUserName: e.target.value })}
					min={VOD.PLAYER_NAME_MIN_LENGTH}
					max={VOD.PLAYER_NAME_MAX_LENGTH}
					required
				/>
			) : (
				<UserSearch
					id="pov"
					inputName="team-player"
					initialUserId={match.povUserId}
					onChange={(newUser) =>
						onChange({
							...match,
							povUserId: newUser.id,
						})
					}
					required
				/>
			)}
		</div>
	);
}

function Match({
	match,
	onChange,
	number,
	type,
}: {
	match: VideoMatchBeingAdded;
	onChange: (match: VideoMatchBeingAdded) => void;
	number: number;
	type: Video["type"];
}) {
	const id = React.useId();

	const [minutes, setMinutes] = React.useState(
		secondsToMinutesNumberTuple(match.startsAt)[0],
	);
	const [seconds, setSeconds] = React.useState(
		secondsToMinutesNumberTuple(match.startsAt)[1],
	);

	const { t } = useTranslation(["game-misc", "vods"]);

	const handleChange = (matchWithNewFields: Partial<VideoMatchBeingAdded>) => {
		onChange({ ...match, ...matchWithNewFields });
	};

	return (
		<div className="stack md">
			<h2>{t("vods:gameCount", { count: number })}</h2>

			<div>
				<Label required>{t("vods:forms.title.startTimestamp")}</Label>
				<div className="stack horizontal sm">
					<div className="stack horizontal sm items-center text-sm">
						<Input
							type="number"
							min={0}
							value={String(minutes)}
							onChange={(e) => {
								const value = Number(e.target.value);

								setMinutes(value);
								onChange({ ...match, startsAt: value * 60 + seconds });
							}}
							testId={`match-${number}-minutes`}
						/>
						{t("vods:minShort")}
					</div>
					<div className="stack horizontal sm items-center text-sm">
						<Input
							type="number"
							min={0}
							max={59}
							value={String(seconds)}
							onChange={(e) => {
								const value = Number(e.target.value);

								setSeconds(value);
								onChange({ ...match, startsAt: value + minutes * 60 });
							}}
							testId={`match-${number}-seconds`}
						/>
						{t("vods:secShort")}
					</div>
				</div>
			</div>

			<div className="stack horizontal sm">
				<div>
					<Label required htmlFor={`match-${number}-mode`}>
						{t("vods:forms.title.mode")}
					</Label>
					<select
						id={`match-${number}-mode`}
						data-testid={`match-${number}-mode`}
						value={match.mode}
						onChange={(e) =>
							handleChange({ mode: e.target.value as VideoMatch["mode"] })
						}
					>
						{modesShort.map((mode) => {
							return (
								<option key={mode} value={mode}>
									{t(`game-misc:MODE_SHORT_${mode}`)}
								</option>
							);
						})}
					</select>
				</div>
				<div>
					<Label required htmlFor={`match-${number}-stage`}>
						{t("vods:forms.title.stage")}
					</Label>
					<select
						id={`match-${number}-stage`}
						data-testid={`match-${number}-stage`}
						value={match.stageId}
						onChange={(e) =>
							handleChange({ stageId: Number(e.target.value) as StageId })
						}
					>
						{stageIds.map((stageId) => {
							return (
								<option key={stageId} value={stageId}>
									{t(`game-misc:STAGE_${stageId}`)}
								</option>
							);
						})}
					</select>
				</div>
			</div>

			<div>
				{type === "CAST" ? (
					<div>
						<Label required>{t("vods:forms.title.weaponsTeamOne")}</Label>
						<div className="stack sm">
							{new Array(4).fill(null).map((_, i) => {
								return (
									<WeaponCombobox
										fullWidth
										key={i}
										inputName={`player-${i}-weapon`}
										initialWeaponId={match.weapons[i]}
										onChange={(selected) => {
											if (!selected) return;
											const weapons = [...match.weapons];
											weapons[i] = Number(selected.value) as MainWeaponId;

											onChange({ ...match, weapons });
										}}
										required
									/>
								);
							})}
						</div>
						<div className="mt-4">
							<Label required>{t("vods:forms.title.weaponsTeamTwo")}</Label>
							<div className="stack sm">
								{new Array(4).fill(null).map((_, i) => {
									const adjustedI = i + 4;
									return (
										<WeaponCombobox
											fullWidth
											key={i}
											inputName={`player-${adjustedI}-weapon`}
											initialWeaponId={match.weapons[adjustedI]}
											onChange={(selected) => {
												if (!selected) return;
												const weapons = [...match.weapons];
												weapons[adjustedI] = Number(
													selected.value,
												) as MainWeaponId;

												onChange({ ...match, weapons });
											}}
											required
										/>
									);
								})}
							</div>
						</div>
					</div>
				) : (
					<>
						<Label required htmlFor={id}>
							{t("vods:forms.title.weapon")}
						</Label>
						<WeaponCombobox
							fullWidth
							id={id}
							inputName={`match-${number}-weapon`}
							initialWeaponId={match.weapons[0]}
							onChange={(selected) =>
								onChange({
									...match,
									weapons: selected?.value
										? [Number(selected.value) as MainWeaponId]
										: [],
								})
							}
							required
						/>
					</>
				)}
			</div>
		</div>
	);
}
