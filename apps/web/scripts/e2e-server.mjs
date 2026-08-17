// e2e/differ server entry: the production build behind a shim that supplies
// the proxy protocol header. adapter-node bakes `paths.origin` at build time
// and otherwise guesses `https://` from a bare request, but one e2e build
// serves many worker ports over plain http — deriving the origin per request
// from `x-forwarded-proto` + Host keeps remote-function CSRF checks passing.
// Run with PROTOCOL_HEADER=x-forwarded-proto (set by the tooling).
import { createServer } from "node:http";
import { handler } from "../build/handler.js";

const port = Number(process.env.PORT ?? 3000);

createServer((req, res) => {
	req.headers["x-forwarded-proto"] = "http";
	handler(req, res);
}).listen(port, () => {
	console.log(`Listening on http://0.0.0.0:${port}`);
});
