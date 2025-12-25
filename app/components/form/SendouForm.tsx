import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { useFetcher } from "@remix-run/react";
import * as React from "react";
import { type DefaultValues, FormProvider, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import type { z } from "zod/v4";
import { logger } from "~/utils/logger";
import type { ActionError } from "~/utils/remix.server";
import { LinkButton } from "../elements/Button";
import { SubmitButton } from "../SubmitButton";

export function SendouForm<T extends z.ZodTypeAny>({
	schema,
	defaultValues,
	heading,
	children,
	cancelLink,
	submitButtonTestId,
}: {
	schema: T;
	defaultValues?: DefaultValues<z.infer<T>>;
	heading?: string;
	children: React.ReactNode;
	cancelLink?: string;
	submitButtonTestId?: string;
}) {
	const { t } = useTranslation(["common"]);
	const fetcher = useFetcher<any>();
	const methods = useForm({
		resolver: standardSchemaResolver(schema),
		defaultValues,
	});

	if (
		methods.formState.isSubmitted &&
		methods.formState.errors &&
		Object.keys(methods.formState.errors).length > 0
	) {
		logger.error(methods.formState.errors);
	}

	React.useEffect(() => {
		if (!fetcher.data?.isError) return;

		const error = fetcher.data as ActionError;

		methods.setError(error.field as any, {
			message: error.msg,
		});
	}, [fetcher.data, methods.setError]);

	const onSubmit = React.useCallback(
		methods.handleSubmit((values) =>
			fetcher.submit(values as Parameters<typeof fetcher.submit>[0], {
				method: "post",
				encType: "application/json",
			}),
		),
		[],
	);

	return (
		<FormProvider {...methods}>
			<fetcher.Form className="stack md-plus items-start" onSubmit={onSubmit}>
				{heading ? <h1 className="text-lg">{heading}</h1> : null}
				{children}
				<div className="stack horizontal lg justify-between mt-6 w-full">
					<SubmitButton state={fetcher.state} testId={submitButtonTestId}>
						{t("common:actions.submit")}
					</SubmitButton>
					{cancelLink ? (
						<LinkButton
							variant="minimal-destructive"
							to={cancelLink}
							size="small"
						>
							{t("common:actions.cancel")}
						</LinkButton>
					) : null}
				</div>
			</fetcher.Form>
		</FormProvider>
	);
}
