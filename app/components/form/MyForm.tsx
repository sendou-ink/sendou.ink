import { zodResolver } from "@hookform/resolvers/zod";
import { useFetcher } from "@remix-run/react";
import * as React from "react";
import { type DefaultValues, FormProvider, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import type { z } from "zod";
import { logger } from "~/utils/logger";
import type { ActionError } from "~/utils/remix.server";
import { Button, LinkButton } from "../Button";
import { SubmitButton } from "../SubmitButton";

export function MyForm<T extends z.ZodTypeAny>({
	schema,
	defaultValues,
	title,
	children,
	handleCancel,
	cancelLink,
}: {
	schema: T;
	defaultValues?: DefaultValues<z.infer<T>>;
	title?: string;
	children: React.ReactNode;
	handleCancel?: () => void;
	cancelLink?: string;
}) {
	const { t } = useTranslation(["common"]);
	const fetcher = useFetcher<any>();
	const methods = useForm({
		resolver: zodResolver(schema),
		defaultValues,
	});

	if (methods.formState.isSubmitted && methods.formState.errors) {
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
			fetcher.submit(values, { method: "post", encType: "application/json" }),
		),
		[],
	);

	return (
		<FormProvider {...methods}>
			<fetcher.Form className="stack md-plus items-start" onSubmit={onSubmit}>
				{title ? <h1 className="text-lg">{title}</h1> : null}
				{children}
				<div className="stack horizontal lg justify-between mt-6 w-full">
					<SubmitButton state={fetcher.state}>
						{t("common:actions.submit")}
					</SubmitButton>
					{handleCancel ? (
						<Button
							variant="minimal-destructive"
							onClick={handleCancel}
							size="tiny"
						>
							{t("common:actions.cancel")}
						</Button>
					) : null}
					{cancelLink ? (
						<LinkButton
							variant="minimal-destructive"
							to={cancelLink}
							size="tiny"
						>
							{t("common:actions.cancel")}
						</LinkButton>
					) : null}
				</div>
			</fetcher.Form>
		</FormProvider>
	);
}
