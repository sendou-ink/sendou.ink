import {
	type ActionFunction,
	type LoaderFunctionArgs,
	redirect,
} from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import * as React from "react";
import {
	Controller,
	get,
	useFieldArray,
	useFormContext,
} from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { Button } from "~/components/Button";
import { WeaponCombobox } from "~/components/Combobox";
import { FormMessage } from "~/components/FormMessage";
import { Label } from "~/components/Label";
import { Main } from "~/components/Main";
import { UserSearch } from "~/components/UserSearch";
import { AddFieldButton } from "~/components/form/AddFieldButton";
import { RemoveFieldButton } from "~/components/form/RemoveFieldButton";
import type { Video } from "~/db/types";
import { requireUser } from "~/features/auth/core/user.server";
import {
	type MainWeaponId,
	modesShort,
	stageIds,
} from "~/modules/in-game-lists";
import {
	type SendouRouteHandle,
	notFoundIfFalsy,
	parseRequestPayload,
} from "~/utils/remix.server";
import { vodVideoPage } from "~/utils/urls";
import { actualNumber, id } from "~/utils/zod";
import { DateFormField } from "../../../components/form/DateFormField";
import { MyForm } from "../../../components/form/MyForm";
import { SelectFormField } from "../../../components/form/SelectFormField";
import { TextFormField } from "../../../components/form/TextFormField";
import { createVod, updateVodByReplacing } from "../queries/createVod.server";
import { findVodById } from "../queries/findVodById.server";
import { videoMatchTypes } from "../vods-constants";
import { videoInputSchema } from "../vods-schemas";
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
			povUserId:
				vodToEdit.pov?.type === "USER" ? vodToEdit.pov.userId : undefined,
		})
	) {
		return { vodToEdit: null };
	}

	return { vodToEdit: { ...vodToEdit, id: vod.id } };
};

export type VodFormFields = z.infer<typeof videoInputSchema>;

export default function NewVodPage() {
	const data = useLoaderData<typeof loader>();
	const { t } = useTranslation(["vods"]);

	return (
		<Main halfWidth>
			<MyForm
				title={
					data.vodToEdit
						? t("vods:forms.title.edit")
						: t("vods:forms.title.create")
				}
				schema={videoInputSchema}
				defaultValues={
					data.vodToEdit
						? {
								vodToEditId: data.vodToEdit.id,
								video: data.vodToEdit,
							}
						: {
								video: {
									type: "TOURNAMENT",
									matches: [
										{ mode: "SZ", stageId: 1, startsAt: "", weapons: [] },
									],
									pov: { type: "USER" } as VodFormFields["video"]["pov"],
								},
							}
				}
			>
				<FormFields />
			</MyForm>
		</Main>
	);
}

function FormFields() {
	const { t } = useTranslation(["vods"]);
	const { watch } = useFormContext<VodFormFields>();
	const videoType = watch("video.type");

	return (
		<>
			<TextFormField<VodFormFields>
				label={t("vods:forms.title.youtubeUrl")}
				name="video.youtubeUrl"
				placeholder="https://www.youtube.com/watch?v=-dQ6JsVIKdY"
				required
				size="medium"
			/>

			<TextFormField<VodFormFields>
				label={t("vods:forms.title.videoTitle")}
				name="video.title"
				placeholder="[SCL 47] (Grand Finals) Team Olive vs. Kraken Paradise"
				required
				size="medium"
			/>

			<DateFormField<VodFormFields>
				label={t("vods:forms.title.videoDate")}
				name="video.date"
				required
				size="extra-small"
			/>

			<SelectFormField<VodFormFields>
				label={t("vods:forms.title.type")}
				name="video.type"
				values={videoMatchTypes.map((role) => ({
					value: role,
					label: t(`vods:type.${role}`),
				}))}
				required
			/>

			{videoType !== "CAST" ? <PovFormField /> : null}

			<MatchesFormfield videoType={videoType} />
		</>
	);
}

function PovFormField() {
	const { t } = useTranslation(["vods", "calendar"]);
	const methods = useFormContext<VodFormFields>();

	const povNameError = get(methods.formState.errors, "video.pov.name");

	return (
		<Controller
			control={methods.control}
			name="video.pov"
			render={({
				field: { onChange, onBlur, value },
				fieldState: { error },
			}) => {
				if (!value) return <></>;

				const asPlainInput = value.type === "NAME";

				const toggleInputType = () => {
					if (asPlainInput) {
						onChange({ type: "USER", userId: undefined });
					} else {
						onChange({ type: "NAME", name: "" });
					}
				};

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
								value={value.name ?? ""}
								onChange={(e) => {
									onChange({ type: "NAME", name: e.target.value });
								}}
								onBlur={onBlur}
							/>
						) : (
							<UserSearch
								id="pov"
								inputName="team-player"
								initialUserId={value.userId}
								onChange={(newUser) =>
									onChange({
										type: "USER",
										userId: newUser.id,
									})
								}
								onBlur={onBlur}
							/>
						)}
						{error && (
							<FormMessage type="error">{error.message as string}</FormMessage>
						)}
						{povNameError && (
							<FormMessage type="error">
								{povNameError.message as string}
							</FormMessage>
						)}
					</div>
				);
			}}
		/>
	);
}

function MatchesFormfield({ videoType }: { videoType: Video["type"] }) {
	const {
		formState: { errors },
	} = useFormContext<VodFormFields>();
	const { fields, append, remove } = useFieldArray<VodFormFields>({
		name: "video.matches",
	});

	const rootError = errors.video?.matches?.root;

	return (
		<div>
			<div className="stack md">
				{fields.map((field, i) => {
					return (
						<MatchesFieldset
							key={field.id}
							idx={i}
							remove={remove}
							canRemove={fields.length > 1}
							videoType={videoType}
						/>
					);
				})}
				<AddFieldButton
					onClick={() => {
						append({ mode: "SZ", stageId: 1, startsAt: "", weapons: [] });
					}}
				/>
				{rootError && (
					<FormMessage type="error">{rootError.message as string}</FormMessage>
				)}
			</div>
		</div>
	);
}

function MatchesFieldset({
	idx,
	remove,
	canRemove,
	videoType,
}: {
	idx: number;
	remove: (idx: number) => void;
	canRemove: boolean;
	videoType: Video["type"];
}) {
	const id = React.useId();
	const { t } = useTranslation(["vods", "game-misc"]);

	return (
		<div className="stack md">
			<div className="stack horizontal sm">
				<h2 className="text-md">{t("vods:gameCount", { count: idx + 1 })}</h2>
				{canRemove ? <RemoveFieldButton onClick={() => remove(idx)} /> : null}
			</div>

			<TextFormField<VodFormFields>
				required
				label={t("vods:forms.title.startTimestamp")}
				name={`video.matches.${idx}.startsAt`}
				placeholder="10:22"
			/>

			<div className="stack horizontal sm">
				<SelectFormField<VodFormFields>
					required
					label={t("vods:forms.title.mode")}
					name={`video.matches.${idx}.mode`}
					values={modesShort.map((mode) => ({
						value: mode,
						label: t(`game-misc:MODE_SHORT_${mode}`),
					}))}
				/>

				<SelectFormField<VodFormFields>
					required
					label={t("vods:forms.title.stage")}
					name={`video.matches.${idx}.stageId`}
					values={stageIds.map((stageId) => ({
						value: stageId,
						label: t(`game-misc:STAGE_${stageId}`),
					}))}
				/>
			</div>

			<Controller
				control={useFormContext<VodFormFields>().control}
				name={`video.matches.${idx}.weapons`}
				render={({ field: { onChange, value } }) => {
					return (
						<div>
							{videoType === "CAST" ? (
								<div>
									<Label required>{t("vods:forms.title.weaponsTeamOne")}</Label>
									<div className="stack sm">
										{new Array(4).fill(null).map((_, i) => {
											return (
												<WeaponCombobox
													key={i}
													required
													fullWidth
													inputName={`player-${i}-weapon`}
													initialWeaponId={value[i]}
													onChange={(selected) => {
														if (!selected) return;
														const weapons = [...value];
														weapons[i] = Number(selected.value) as MainWeaponId;

														onChange(weapons);
													}}
												/>
											);
										})}
									</div>
									<div className="mt-4">
										<Label required>
											{t("vods:forms.title.weaponsTeamTwo")}
										</Label>
										<div className="stack sm">
											{new Array(4).fill(null).map((_, i) => {
												const adjustedI = i + 4;
												return (
													<WeaponCombobox
														key={i}
														required
														fullWidth
														inputName={`player-${adjustedI}-weapon`}
														initialWeaponId={value[adjustedI]}
														onChange={(selected) => {
															if (!selected) return;
															const weapons = [...value];
															weapons[adjustedI] = Number(
																selected.value,
															) as MainWeaponId;

															onChange(weapons);
														}}
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
										id={id}
										required
										fullWidth
										inputName={`match-${idx}-weapon`}
										initialWeaponId={value[0]}
										onChange={(selected) =>
											onChange(
												selected?.value
													? [Number(selected.value) as MainWeaponId]
													: [],
											)
										}
									/>
								</>
							)}
						</div>
					);
				}}
			/>
		</div>
	);
}
