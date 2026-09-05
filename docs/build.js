const fs = require("fs");

const {execFileSync: execFileSync} = require("child_process");

const path = require("path");

const dir = __dirname;

const core = fs.readFileSync(path.join(dir, "phenikaa-core.js"), "utf8");

const wrapper = fs.readFileSync(path.join(dir, "userscript-wrapper.js"), "utf8");

const GH = "https://hoangnhat-27.github.io/phenikaa-calendar";

const meta = [ "// ==UserScript==", "// @name         Phenikaa Calendar — Đồng bộ lịch học & thi Phenikaa", "// @namespace    https://phenikaa-uni.edu.vn/phenikaa-calendar", "// @version      2.3.0", "// @description  Tự động kiểm tra lịch học/lịch thi trên QLDT Phenikaa mỗi lần vào trang, báo khi có thay đổi và xuất ra file .ics.", "// @author       Phenikaa Calendar", "// @match        https://qldtbeta.phenikaa-uni.edu.vn/*", "// @run-at       document-idle", "// @grant        none", "// @noframes", "// @updateURL    " + GH + "/phenikaa-calendar.user.js", "// @downloadURL  " + GH + "/phenikaa-calendar.user.js", "// ==/UserScript==", "" ].join("\n");

const syncCfg = "\nwindow.PKA_SYNC_URL = " + JSON.stringify(GH + "/sync.html") + ";\nwindow.PKA_APP_URL = " + JSON.stringify(GH + "/app.html") + ";\n";

fs.writeFileSync(path.join(dir, "phenikaa-calendar.user.js"), meta + "\n" + core + syncCfg + "\n" + wrapper);

console.log("✓ phenikaa-calendar.user.js");

if (process.argv.includes("--dist")) {
    const distDir = path.join(dir, "..", "dist");
    fs.rmSync(distDir, {
        recursive: true,
        force: true
    });
    fs.mkdirSync(distDir, {
        recursive: true
    });
    const npx = function(args) {
        execFileSync("npx", [ "--yes" ].concat(args), {
            stdio: "inherit",
            shell: true
        });
    };
    const src = function(f) {
        return path.join(dir, f);
    };
    const out = function(f) {
        return path.join(distDir, f);
    };
    [ "index.html", "app.html", "sync.html" ].forEach(function(f) {
        try {
            npx([ "html-minifier-terser", "--collapse-whitespace", "--remove-comments", "--minify-css", "true", "--minify-js", "true", src(f), "-o", out(f) ]);
        } catch (e) {
            fs.copyFileSync(src(f), out(f));
            console.warn("  (chép nguyên, không minify được):", f);
        }
    });
    [ "phenikaa-core.js", "phenikaa-config.js", "sw.js" ].forEach(function(f) {
        try {
            npx([ "terser@5", src(f), "-c", "-m", "-o", out(f) ]);
        } catch (e) {
            fs.copyFileSync(src(f), out(f));
            console.warn("  (chép nguyên):", f);
        }
    });
    [ "phenikaa-calendar.user.js", "icon.svg" ].forEach(function(f) {
        fs.copyFileSync(src(f), out(f));
    });
    fs.writeFileSync(out("manifest.webmanifest"), JSON.stringify(JSON.parse(fs.readFileSync(src("manifest.webmanifest"), "utf8"))));
    console.log("✓ dist/  (đã minify — deploy thư mục này lên GitHub Pages)");
}