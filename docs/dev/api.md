# API

API for external projects to access sendou.ink data for projects such as streams is available. It is mostly for reading data, with a few endpoints for managing tournaments (see [Write endpoints](#write-endpoints)). You will need a token to access the API. If you have permissions (supporters of Supporter tier or higher, or any admin, organizer or streamer of an established organization has access), you can access the https://sendou.ink/api page to generate one.

## Rules

Primarily the API is meant to be used to provide data for tournament stream layouts. Check other usecases with Sendou ahead of time. Cache everything that you can. For anything that is not time sensitive prefer times outside of peak hours (EU/NA evenings). API tokens can be rate limited or disabled if the load causes risks other users using the site.

## Endpoints

Check out [`app/features/api-public/schema.ts`](../../app/features/api-public/schema.ts) - it lists every endpoint along with its request and response types.

## Write endpoints

The `POST` endpoints let tournament organizers manage their tournament from outside sendou.ink: setting seeds and starting brackets, registering teams and editing their rosters. They require a write token, which is generated on the same https://sendou.ink/api page. A write token also works for every read endpoint.

Requests are made as the user who owns the token and go through the same checks as the tournament admin page, so you need to be an organizer of the tournament in question. Request bodies are JSON and their shapes are in the schema file linked above.

## Curl example

```bash
sendou@macbook ~ % curl -H "Authorization: Bearer mytoken" https://sendou.ink/api/tournament/1 
{"name":"PICNIC mini","startTime":"2023-05-18T18:00:00.000Z","url":"https://sendou.ink/to/1/brackets","logoUrl":"https://sendou-assets.nyc3.cdn.digitaloceanspaces.com/img/tournament-logos/pn.avif","teams":{"checkedInCount":25,"registeredCount":31},"brackets":[{"name":"Main bracket","type":"double_elimination"}],"organizationId":1,"isFinalized":true}% 
```

## Developing

Some "copy paste" is expected to keep public API separated from internal implementations. This is why we call database on each route handler separately as an exception to how we do it in internal loaders.

This API is lean on purpose and by default new endpoints will not be added. This is to keep maintenance burden low and anyway the project is not designed to support a large number of API consumers.

## Clients (unofficial)

- [sendou.py (Python)](https://github.com/IPLSplatoon/sendou.py)
