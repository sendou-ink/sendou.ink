import { zodResolver } from "@hookform/resolvers/zod";
import { useFetcher, useSearchParams } from "@remix-run/react";
import * as React from "react";
import { FormProvider, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { SubmitButton } from "~/components/SubmitButton";
import { SendouButton } from "~/components/elements/Button";
import { SendouDialog } from "~/components/elements/Dialog";
import { InputFormField } from "~/components/form/InputFormField";
import { InputGroupFormField } from "~/components/form/InputGroupFormField";
import { TextArrayFormField } from "~/components/form/TextArrayFormField";
import { ToggleFormField } from "~/components/form/ToggleFormField";
import { FilterFilledIcon } from "~/components/icons/FilterFilled";
import type { CalendarEventTag } from "~/db/tables";
import { useUser } from "~/features/auth/core/user";
import { calendarFiltersFormSchema } from "~/features/calendar/calendar-schemas";
import type { CalendarFilters } from "~/features/calendar/calendar-types";
import { TagsFormField } from "~/features/calendar/components/TagsFormField";

export function FiltersDialog({ filters }: { filters: CalendarFilters }) {
	const { t } = useTranslation(["calendar"]);
	const [isOpen, setIsOpen] = React.useState(false);

	return (
		<>
			<SendouButton
				size="small"
				icon={<FilterFilledIcon />}
				onClick={() => setIsOpen(true)}
				data-testid="filter-events-button"
			>
				{t("calendar:filter.button")}
			</SendouButton>
			<SendouDialog
				heading={t("calendar:filter.heading")}
				isOpen={isOpen}
				onClose={() => setIsOpen(false)}
			>
				<FiltersForm
					filters={filters}
					closeDialog={() => {
						setIsOpen(false);
					}}
				/>
			</SendouDialog>
		</>
	);
}

const TAGS_TO_OMIT: Array<CalendarEventTag> = [
	"CARDS",
	"SR",
	"S1",
	"S2",
	"SZ",
	"TW",
	"ONES",
	"DUOS",
	"TRIOS",
] as const;

function FiltersForm({
	filters,
	closeDialog,
}: { filters: CalendarFilters; closeDialog: () => void }) {
	const user = useUser();
	const { t } = useTranslation(["game-misc", "calendar"]);
	const methods = useForm({
		resolver: zodResolver(calendarFiltersFormSchema),
		defaultValues: filters,
	});
	const fetcher = useFetcher<any>();
	const [, setSearchParams] = useSearchParams();

	const filtersToSearchParams = (newFilters: CalendarFilters) => {
		setSearchParams((prev) => {
			prev.set("filters", JSON.stringify(newFilters));
			return prev;
		});
	};

	const onApply = React.useCallback(
		methods.handleSubmit((values) => {
			filtersToSearchParams(values);
			closeDialog();
		}),
		[],
	);

	const onApplyAndPersist = React.useCallback(
		methods.handleSubmit((values) =>
			fetcher.submit(values, { method: "post", encType: "application/json" }),
		),
		[],
	);

	return (
		<FormProvider {...methods}>
			<fetcher.Form
				className="stack md-plus items-start"
				onSubmit={onApplyAndPersist}
			>
				<InputGroupFormField<CalendarFilters>
					type="checkbox"
					label={t("calendar:filter.modes")}
					name={"modes" as const}
					values={[
						{ label: t("game-misc:MODE_LONG_TW"), value: "TW" },
						{ label: t("game-misc:MODE_LONG_SZ"), value: "SZ" },
						{ label: t("game-misc:MODE_LONG_TC"), value: "TC" },
						{ label: t("game-misc:MODE_LONG_RM"), value: "RM" },
						{ label: t("game-misc:MODE_LONG_CB"), value: "CB" },
						{ label: t("game-misc:MODE_LONG_SR"), value: "SR" },
						{ label: t("game-misc:MODE_LONG_TB"), value: "TB" },
					]}
				/>

				<ToggleFormField<CalendarFilters>
					label={t("calendar:filter.exactModes")}
					name={"modesExact" as const}
					bottomText={t("calendar:filter.exactModesBottom")}
				/>

				<InputGroupFormField<CalendarFilters>
					type="checkbox"
					label={t("calendar:filter.games")}
					name={"games" as const}
					values={[
						{ label: t("game-misc:GAME_S1"), value: "S1" },
						{ label: t("game-misc:GAME_S2"), value: "S2" },
						{ label: t("game-misc:GAME_S3"), value: "S3" },
					]}
				/>

				<InputGroupFormField<CalendarFilters>
					type="checkbox"
					label={t("calendar:filter.vs")}
					name={"preferredVersus" as const}
					values={[
						{ label: "4v4", value: "4v4" },
						{ label: "3v3", value: "3v3" },
						{ label: "2v2", value: "2v2" },
						{ label: "1v1", value: "1v1" },
					]}
				/>

				<InputGroupFormField<CalendarFilters>
					type="radio"
					label={t("calendar:filter.startTime")}
					name={"preferredStartTime" as const}
					values={[
						{ label: t("calendar:filter.startTime.any"), value: "ANY" },
						{ label: t("calendar:filter.startTime.eu"), value: "EU" },
						{ label: t("calendar:filter.startTime.na"), value: "NA" },
						{ label: t("calendar:filter.startTime.au"), value: "AU" },
					]}
				/>

				<TagsFormField<CalendarFilters>
					label={t("calendar:filter.tagsIncluded")}
					name={"tagsIncluded" as const}
					tagsToOmit={TAGS_TO_OMIT}
				/>

				<TagsFormField<CalendarFilters>
					label={t("calendar:filter.tagsExcluded")}
					name={"tagsExcluded" as const}
					tagsToOmit={TAGS_TO_OMIT}
				/>

				<ToggleFormField<CalendarFilters>
					label={t("calendar:filter.isSendou")}
					name={"isSendou" as const}
				/>

				<ToggleFormField<CalendarFilters>
					label={t("calendar:filter.isRanked")}
					name={"isRanked" as const}
				/>

				<InputFormField<CalendarFilters>
					label={t("calendar:filter.minTeamCount")}
					type="number"
					name={"minTeamCount" as const}
				/>

				<TextArrayFormField<CalendarFilters>
					label={t("calendar:filter.orgsIncluded")}
					name={"orgsIncluded" as const}
				/>

				<TextArrayFormField<CalendarFilters>
					label={t("calendar:filter.orgsExcluded")}
					name={"orgsExcluded" as const}
				/>

				<TextArrayFormField<CalendarFilters>
					label={t("calendar:filter.authorIdsExcluded")}
					name={"authorIdsExcluded" as const}
					bottomText={t("calendar:filter.authorIdsExcludedBottom")}
				/>

				<div className="stack horizontal md justify-center mt-6 w-full">
					<SendouButton onPress={() => onApply()}>
						{t("calendar:filter.apply")}
					</SendouButton>
					{user ? (
						<SubmitButton variant="outlined" state={fetcher.state}>
							{t("calendar:filter.applyAndDefault")}
						</SubmitButton>
					) : null}
				</div>
			</fetcher.Form>
		</FormProvider>
	);
}
