const http = require("http");

const fs = require("fs");

const path = require("path");

const root = __dirname;

const PORT = process.env.PORT || 8080;

const TYPES = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".ics": "text/calendar; charset=utf-8",
    ".webmanifest": "application/manifest+json; charset=utf-8",
    ".svg": "image/svg+xml"
};

http.createServer(function(req, res) {
    let url = decodeURIComponent(req.url.split("?")[0]);
    if (url === "/") url = "/index.html";
    const file = path.join(root, path.normalize(url));
    if (!file.startsWith(root)) {
        res.writeHead(403);
        return res.end("403");
    }
    fs.readFile(file, function(err, buf) {
        if (err) {
            res.writeHead(404);
            return res.end("404 " + url);
        }
        res.writeHead(200, {
            "Content-Type": TYPES[path.extname(file)] || "application/octet-stream"
        });
        res.end(buf);
    });
}).listen(PORT, function() {
    console.log("Phenikaa test server → http://localhost:" + PORT + "/  (Ctrl+C để dừng)");
    console.log("  • Trang phát hành : http://localhost:" + PORT + "/index.html");
    console.log("  • Trang QLDT giả  : http://localhost:" + PORT + "/test/mock-qldt.html");
});