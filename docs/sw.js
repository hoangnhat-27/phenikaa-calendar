const CACHE = "pka-shell-v9";

const SHELL = [ "app.html", "phenikaa-core.js?v=7", "phenikaa-config.js?v=7", "manifest.webmanifest", "icon.svg", "icon-180.png" ];

self.addEventListener("install", function(e) {
    e.waitUntil(caches.open(CACHE).then(function(c) {
        return c.addAll(SHELL);
    }).then(function() {
        return self.skipWaiting();
    }));
});

self.addEventListener("activate", function(e) {
    e.waitUntil(caches.keys().then(function(keys) {
        return Promise.all(keys.filter(function(k) {
            return k !== CACHE;
        }).map(function(k) {
            return caches.delete(k);
        }));
    }).then(function() {
        return self.clients.claim();
    }));
});

self.addEventListener("fetch", function(e) {
    if (e.request.method !== "GET") return;
    let url;
    try {
        url = new URL(e.request.url);
    } catch (_) {
        return;
    }
    if (url.origin !== self.location.origin) return;
    e.respondWith(fetch(e.request).then(function(res) {
        if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then(function(c) {
                c.put(e.request, copy);
            });
        }
        return res;
    }).catch(function() {
        return caches.match(e.request).then(function(hit) {
            if (hit) return hit;
            if (e.request.mode === "navigate") return caches.match("app.html");
            return new Response("", {
                status: 504
            });
        });
    }));
});