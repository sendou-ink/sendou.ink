import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/luti")({
	component: RouteComponent,
});

function RouteComponent() {
	return <div>Hello "/luti"!</div>;
}
