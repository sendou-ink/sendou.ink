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
import { FilterIcon } from "~/components/icons/Filter";
import type { CalendarEventTag } from "~/db/tables";
import { calendarFiltersFormSchema } from "~/features/calendar/calendar-schemas";
import type { CalendarFilters } from "~/features/calendar/calendar-types";
import { TagsFormField } from "~/features/calendar/components/TagsFormField";

export function FiltersDialog({ filters }: { filters: CalendarFilters }) {
	const [isOpen, setIsOpen] = React.useState(false);

	return (
		<>
			<SendouButton
				variant="outlined"
				size="small"
				icon={<FilterIcon />}
				onClick={() => setIsOpen(true)}
			>
				Filter
			</SendouButton>
			<SendouDialog
				heading="Filter calendar events"
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
	const { t } = useTranslation(["game-misc"]);
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
					label="Modes"
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
					label="Exact modes"
					name={"modesExact" as const}
					bottomText="For example if you chose only SZ above and toggle this, SZ only events are the only ones that will show up"
				/>

				<InputGroupFormField<CalendarFilters>
					type="checkbox"
					label="Games"
					name={"games" as const}
					values={[
						{ label: t("game-misc:GAME_S1"), value: "S1" },
						{ label: t("game-misc:GAME_S2"), value: "S2" },
						{ label: t("game-misc:GAME_S3"), value: "S3" },
					]}
				/>

				<InputGroupFormField<CalendarFilters>
					type="checkbox"
					label="Vs."
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
					label="Start time"
					name={"preferredStartTime" as const}
					values={[
						{ label: "Any", value: "ANY" },
						{ label: "Europe friendly", value: "EU" },
						{ label: "Americas friendly", value: "NA" },
						{ label: "AU/NZ friendly", value: "AU" },
					]}
				/>

				<TagsFormField<CalendarFilters>
					label="Tags included"
					name={"tagsIncluded" as const}
					tagsToOmit={TAGS_TO_OMIT}
				/>

				<TagsFormField<CalendarFilters>
					label="Tags excluded"
					name={"tagsExcluded" as const}
					tagsToOmit={TAGS_TO_OMIT}
				/>

				<ToggleFormField<CalendarFilters>
					label="Only events hosted on sendou.ink"
					name={"isSendou" as const}
				/>

				<ToggleFormField<CalendarFilters>
					label="Only ranked events"
					name={"isRanked" as const}
				/>

				<InputFormField<CalendarFilters>
					label="Minimum team count"
					type="number"
					name={"minTeamCount" as const}
				/>

				<TextArrayFormField<CalendarFilters>
					label="Visible organizations"
					name={"orgsIncluded" as const}
				/>

				<TextArrayFormField<CalendarFilters>
					label="Hidden organizations"
					name={"orgsExcluded" as const}
				/>

				<TextArrayFormField<CalendarFilters>
					label="Authors excluded"
					name={"authorIdsExcluded" as const}
					bottomText="You can find a user's id on their profile page"
				/>

				<div className="stack horizontal md justify-center mt-6 w-full">
					<SendouButton onPress={() => onApply()}>Apply</SendouButton>
					<SubmitButton variant="outlined" state={fetcher.state}>
						Apply & make default
					</SubmitButton>
				</div>
			</fetcher.Form>
		</FormProvider>
	);
}
