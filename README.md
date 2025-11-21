# cloudflare-cors-anywhere

*forked from [Zibri/clouflare-cors-anywhere](https://github.com/Zibri/cloudflare-cors-anywhere)*


Cloudflare CORS proxy in a Cloudflare worker.


Post:
http://www.zibri.org/2019/07/your-own-cors-anywhere-proxy-on.html

## Deployment

This project is written in [Cloudfalre Workers](https://workers.cloudflare.com/), and can be easily deployed with [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/).

```bash
npx wrangler deploy
```

## Usage Example

```javascript
fetch('https://test.cors.workers.dev/?https://httpbin.org/post', {
  method: 'post',
  headers: {
    'x-foo': 'bar',
    'x-bar': 'foo',
    'x-cors-headers': JSON.stringify({
      // allows to send forbidden headers
      // https://developer.mozilla.org/en-US/docs/Glossary/Forbidden_header_name
      'cookies': 'x=123'
    }) 
  }
}).then(res => {
  // allows to read all headers (even forbidden headers like set-cookies)
  const headers = JSON.parse(res.headers.get('cors-received-headers'))
  console.log(headers)
  return res.json()
}).then(console.log)
```
  

## Access Control

Configure optional whitelist/blacklist filters via Cloudflare Workers environment variables:

- `WHITELIST_ORIGINS` - Comma-separated allowed origins (e.g., "https://myapp.com,*.mydomain.com")
- `BLACKLIST_ORIGINS` - Comma-separated blocked origins  
- `WHITELIST_URLS` - Comma-separated allowed target URLs
- `BLACKLIST_URLS` - Comma-separated blocked target URLs

Supports wildcards: `*.example.com`, `https://api.*/v1/*`, `http://localhost:*`

Set these in your Cloudflare Workers dashboard under Settings > Variables.

