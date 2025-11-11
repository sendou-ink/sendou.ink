# API

API for external projects to access sendou.ink data for projects such as streams is available. This API is for reading data, writing is not supported. You will need a token to access the API. If you have permissions (supporters of Supporter tier or higher, or any admin, organizer or streamer of an established organization has access), you can access the https://sendou.ink/api page to generate one.

## Rules

Primarily the API is meant to be used to provide data for tournament stream layouts. Check other usecases with Sendou ahead of time. Cache everything that you can. For anything that is not time sensitive prefer times outside of peak hours (EU/NA evenings). API tokens can be rate limited or disabled if the load causes risks other users using the site.

## Endpoints

Check out `sendou.ink/app/features/api-public/schema.ts`

## Curl example

```bash
sendou@macbook ~ % curl -H "Authorization: Bearer mytoken" https://sendou.ink/api/tournament/1 
{"name":"PICNIC mini","startTime":"2023-05-18T18:00:00.000Z","url":"https://sendou.ink/to/1/brackets","logoUrl":"https://sendou.ink/static-assets/img/tournament-logos/pn.png","teams":{"checkedInCount":25,"registeredCount":31},"brackets":[{"name":"Main bracket","type":"double_elimination"}],"organizationId":1,"isFinalized":true}% 
```

## Clients (unofficial)

- [sendou.py (Python)](https://github.com/IPLSplatoon/sendou.py)
