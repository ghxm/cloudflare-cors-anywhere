/*
CORS Anywhere as a Cloudflare Worker!
(c) 2019 by Zibri (www.zibri.org)
email: zibri AT zibri DOT org
https://github.com/Zibri/cloudflare-cors-anywhere

This Cloudflare Worker script acts as a CORS proxy that allows
cross-origin resource sharing for specified origins and URLs.
It handles OPTIONS preflight requests and modifies response headers accordingly to enable CORS.
The script also includes functionality to parse custom headers and provide detailed information
about the CORS proxy service when accessed without specific parameters.
The script is configurable with whitelist and blacklist patterns, although the blacklist feature is currently unused.
The main goal is to facilitate cross-origin requests while enforcing specific security and rate-limiting policies.
*/

// Configuration: Whitelist and Blacklist with Environment Variables
function parseList(envVar, defaultValue = []) {
    if (!envVar || envVar === undefined || envVar === null || envVar?.trim() === '') {
        return defaultValue;
    }
    return envVar.split(',').map(item => item.trim()).filter(item => item.length > 0);
}

function wildcardToRegex(pattern) {
    // Convert wildcard pattern to regex
    return pattern
        .replace(/[.+^${}()|[\]\\]/g, '\\$&') // Escape regex special chars except *
        .replace(/\*/g, '.*'); // Convert * to .*
}

// Function to get environment-specific lists
function getAccessLists(env) {
    return {
        whitelistUrls: parseList(env?.WHITELIST_URLS, []),
        blacklistUrls: parseList(env?.BLACKLIST_URLS, []),
        whitelistOrigins: parseList(env?.WHITELIST_ORIGINS, []), // Empty = allow all
        blacklistOrigins: parseList(env?.BLACKLIST_ORIGINS, [])
    };
}

// Function to check if a given URI or origin is listed in a pattern list
function isMatched(uri, listing) {
    if (!uri || typeof uri !== "string" || listing.length === 0) {
        return listing.length === 0; // If no patterns, allow; if patterns exist, require match
    }
    
    return listing.some(pattern => {
        // Convert wildcard to regex if it contains wildcards
        if (pattern.includes('*')) {
            const regexPattern = wildcardToRegex(pattern);
            return new RegExp(`^${regexPattern}$`, 'i').test(uri);
        }
        // Use direct regex pattern if no wildcards
        return new RegExp(pattern, 'i').test(uri);
    });
}

// Function to check if access should be allowed based on whitelist/blacklist rules
function isAccessAllowed(targetUrl, originHeader, accessLists) {
    const { whitelistUrls, blacklistUrls, whitelistOrigins, blacklistOrigins } = accessLists;
    
    // Check if origin is blacklisted
    if (blacklistOrigins.length > 0 && isMatched(originHeader, blacklistOrigins)) {
        return false;
    }
    
    // Check if target URL is blacklisted  
    if (blacklistUrls.length > 0 && isMatched(targetUrl, blacklistUrls)) {
        return false;
    }
    
    // Check if origin is whitelisted (if whitelist exists)
    if (whitelistOrigins.length > 0 && !isMatched(originHeader, whitelistOrigins)) {
        return false;
    }
    
    // Check if target URL is whitelisted (if whitelist exists)
    if (whitelistUrls.length > 0 && !isMatched(targetUrl, whitelistUrls)) {
        return false;
    }
    
    return true;
}

// Export fetch handler for Cloudflare Workers
export default {
    async fetch(request, env, ctx) {
        const isPreflightRequest = (request.method === "OPTIONS");
        
        const originUrl = new URL(request.url);
        const accessLists = getAccessLists(env);

        // Function to modify headers to enable CORS
        function setupCORSHeaders(headers) {
            headers.set("Access-Control-Allow-Origin", request.headers.get("Origin"));
            if (isPreflightRequest) {
                headers.set("Access-Control-Allow-Methods", request.headers.get("access-control-request-method"));
                const requestedHeaders = request.headers.get("access-control-request-headers");

                if (requestedHeaders) {
                    headers.set("Access-Control-Allow-Headers", requestedHeaders);
                }

                headers.delete("X-Content-Type-Options"); // Remove X-Content-Type-Options header
            }
            return headers;
        }

        const targetUrl = decodeURIComponent(decodeURIComponent(originUrl.search.substr(1)));

        const originHeader = request.headers.get("Origin");
        const connectingIp = request.headers.get("CF-Connecting-IP");

        if (isAccessAllowed(targetUrl, originHeader, accessLists)) {
            let customHeaders = request.headers.get("x-cors-headers");

            if (customHeaders !== null) {
                try {
                    customHeaders = JSON.parse(customHeaders);
                } catch (e) {}
            }

            if (originUrl.search.startsWith("?")) {
                const filteredHeaders = {};
                for (const [key, value] of request.headers.entries()) {
                    if (
                        (key.match("^origin") === null) &&
                        (key.match("eferer") === null) &&
                        (key.match("^cf-") === null) &&
                        (key.match("^x-forw") === null) &&
                        (key.match("^x-cors-headers") === null)
                    ) {
                        filteredHeaders[key] = value;
                    }
                }

                if (customHeaders !== null) {
                    Object.entries(customHeaders).forEach((entry) => (filteredHeaders[entry[0]] = entry[1]));
                }

                const newRequest = new Request(request, {
                    redirect: "follow",
                    headers: filteredHeaders
                });

                const response = await fetch(targetUrl, newRequest);
                let responseHeaders = new Headers(response.headers);
                const exposedHeaders = [];
                const allResponseHeaders = {};
                for (const [key, value] of response.headers.entries()) {
                    exposedHeaders.push(key);
                    allResponseHeaders[key] = value;
                }
                exposedHeaders.push("cors-received-headers");
                responseHeaders = setupCORSHeaders(responseHeaders);

                responseHeaders.set("Access-Control-Expose-Headers", exposedHeaders.join(","));
                responseHeaders.set("cors-received-headers", JSON.stringify(allResponseHeaders));

                const responseBody = isPreflightRequest ? null : await response.arrayBuffer();

                const responseInit = {
                    headers: responseHeaders,
                    status: isPreflightRequest ? 200 : response.status,
                    statusText: isPreflightRequest ? "OK" : response.statusText
                };
                return new Response(responseBody, responseInit);

            } else {
                let responseHeaders = new Headers();
                responseHeaders = setupCORSHeaders(responseHeaders);

                let country = false;
                let colo = false;
                if (typeof request.cf !== "undefined") {
                    country = request.cf.country || false;
                    colo = request.cf.colo || false;
                }

                return new Response(
                    "CLOUDFLARE-CORS-ANYWHERE\n\n" +
                    "Source:\nhttps://github.com/Zibri/cloudflare-cors-anywhere\n\n" +
                    "Usage:\n" +
                    originUrl.origin + "/?uri\n\n" +
                    "Limits: 100,000 requests/day\n" +
                    "          1,000 requests/10 minutes\n\n" +
                    (originHeader !== null ? "Origin: " + originHeader + "\n" : "") +
                    "IP: " + connectingIp + "\n" +
                    (country ? "Country: " + country + "\n" : "") +
                    (colo ? "Datacenter: " + colo + "\n" : "") +
                    "\n" +
                    (customHeaders !== null ? "\nx-cors-headers: " + JSON.stringify(customHeaders) : ""),
                    {
                        status: 200,
                        headers: responseHeaders
                    }
                );
            }
        } else {
            return new Response(
                "Create your own CORS proxy</br>\n" +
                "<a href='https://github.com/Zibri/cloudflare-cors-anywhere'>https://github.com/Zibri/cloudflare-cors-anywhere</a></br>\n",
                {
                    status: 403,
                    statusText: 'Forbidden',
                    headers: {
                        "Content-Type": "text/html"
                    }
                }
            );
        }
    }
};
