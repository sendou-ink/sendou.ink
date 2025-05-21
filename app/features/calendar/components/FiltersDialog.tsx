import { zodResolver } from "@hookform/resolvers/zod";
import { useFetcher, useSearchParams } from "@remix-run/react";
import * as React from "react";
import { FormProvider, useForm } from "react-hook-form";
import { SubmitButton } from "~/components/SubmitButton";
import { SendouButton } from "~/components/elements/Button";
import { SendouDialog } from "~/components/elements/Dialog";
import { TextArrayFormField } from "~/components/form/TextArrayFormField";
import { ToggleFormField } from "~/components/form/ToggleFormField";
import { FilterIcon } from "~/components/icons/Filter";
import type { CalendarEventTag } from "~/db/tables";
import { calendarFiltersSchema } from "~/features/calendar/calendar-schemas";
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
	const methods = useForm({
		resolver: zodResolver(calendarFiltersSchema),
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
				<TagsFormField<CalendarFilters>
					label="Tags included"
					name={"tagsIncluded" as const}
					bottomText="Only show events with at least one of the selected tags"
					tagsToOmit={TAGS_TO_OMIT}
				/>

				<TagsFormField<CalendarFilters>
					label="Tags excluded"
					name={"tagsExcluded" as const}
					bottomText="Hide events with at least one of the selected tags"
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

				<TextArrayFormField<CalendarFilters>
					label="Organizations to exclude"
					name={"orgsExcluded" as const}
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
