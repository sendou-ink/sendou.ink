# API

API for external projects to access sendou.ink data for projects such as streams is available. This API is for reading data, writing is not supported. You will need a token to access the API. Currently access is limited but you can request a token from Sendou.

## Endpoints

Check out `sendou.ink/app/features/api-public/schema.ts`

## Curl example

```bash
sendou@macbook ~ % curl -H "Authorization: Bearer mytoken" https://sendou.ink/api/tournament/1 
{"name":"PICNIC mini","startTime":"2023-05-18T18:00:00.000Z","url":"https://sendou.ink/to/1/brackets","logoUrl":"https://sendou.ink/static-assets/img/tournament-logos/pn.png","teams":{"checkedInCount":25,"registeredCount":31},"brackets":[{"name":"Main bracket","type":"double_elimination"}],"organizationId":1,"isFinalized":true}% 
```

## Clients (unofficial)

- [sendou.py (Python)](https://github.com/IPLSplatoon/sendou.py)
