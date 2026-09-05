// ==UserScript==
// @name         Phenikaa Calendar — Đồng bộ lịch học & thi Phenikaa
// @namespace    https://phenikaa-uni.edu.vn/phenikaa-calendar
// @version      2.3.0
// @description  Tự động kiểm tra lịch học/lịch thi trên QLDT Phenikaa mỗi lần vào trang, báo khi có thay đổi và xuất ra file .ics.
// @author       Phenikaa Calendar
// @match        https://qldtbeta.phenikaa-uni.edu.vn/*
// @run-at       document-idle
// @grant        none
// @noframes
// @updateURL    https://hoangnhat-27.github.io/phenikaa-calendar/phenikaa-calendar.user.js
// @downloadURL  https://hoangnhat-27.github.io/phenikaa-calendar/phenikaa-calendar.user.js
// ==/UserScript==

(function() {
    "use strict";
    if (window.PKACAL && window.PKACAL.__ready) return;
    const wait = function(ms) {
        return new Promise(function(r) {
            setTimeout(r, ms);
        });
    };
    function extractTimeRange(raw) {
        if (!raw) return null;
        const str = raw.replace(/\s+(?:đến|to|~)\s+/gi, " - ");
        const m = str.match(/(\d{1,2})(?:[:h](\d{2}))?\s*h?\s*-\s*(\d{1,2})(?:[:h](\d{2}))?\s*h?/i);
        if (!m) return null;
        return {
            start: m[1].padStart(2, "0") + ":" + (m[2] || "00"),
            end: m[3].padStart(2, "0") + ":" + (m[4] || "00")
        };
    }
    function toIcsTimestamp(dateStr, timeHHMM) {
        const parts = dateStr.includes("/") ? dateStr.split("/") : [ dateStr.slice(0, 2), dateStr.slice(2, 4), dateStr.slice(4, 8) ];
        const d = parts[0], m = parts[1], y = parts[2];
        const t = timeHHMM.split(":");
        return y + m.padStart(2, "0") + d.padStart(2, "0") + "T" + t[0].padStart(2, "0") + t[1].padStart(2, "0") + "00";
    }
    function toDateOnly(dStr) {
        const p = dStr.split("/");
        return p[2] + p[1].padStart(2, "0") + p[0].padStart(2, "0");
    }
    function nextDay(yyyymmdd) {
        const y = +yyyymmdd.slice(0, 4), m = +yyyymmdd.slice(4, 6), d = +yyyymmdd.slice(6, 8);
        const dt = new Date(Date.UTC(y, m - 1, d + 1));
        const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
        const dd = String(dt.getUTCDate()).padStart(2, "0");
        return dt.getUTCFullYear() + mm + dd;
    }
    function icsEscape(v) {
        return String(v == null ? "" : v).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
    }
    function foldLine(line) {
        if (line.length <= 74) return line;
        let out = line.slice(0, 74), rest = line.slice(74);
        while (rest.length > 73) {
            out += "\r\n " + rest.slice(0, 73);
            rest = rest.slice(73);
        }
        return out + "\r\n " + rest;
    }
    function dtStampUtc() {
        return (new Date).toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
    }
    function parseWeeklyGridSchedule() {
        const events = [];
        document.querySelectorAll(".calendar-week-table .date-body .day-of-week").forEach(function(col) {
            const rawDateId = col.id.replace("row", "");
            if (!rawDateId || rawDateId.length !== 8) return;
            col.querySelectorAll(".task").forEach(function(task) {
                const titleElem = task.querySelector(".task-header .title") || task.querySelector(".title");
                const dateElem = task.querySelector(".task-date") || task.querySelector(".task-header");
                const descElem = task.querySelector(".task-description");
                if (!titleElem || !dateElem) return;
                const timeRange = extractTimeRange(dateElem.innerText);
                if (!timeRange) return;
                let location = "", descText = "";
                if (descElem) {
                    const lines = descElem.innerText.split("\n").map(function(l) {
                        return l.trim();
                    }).filter(function(l) {
                        return l.length > 0 && !l.includes("thumbs-up");
                    });
                    descText = lines.join(" | ");
                    if (lines.length >= 2) location = lines[lines.length - 2];
                }
                events.push({
                    uid: "study_" + (task.id || Math.random().toString(36).slice(2)) + "_" + rawDateId + "@pka",
                    title: "[HỌC] " + titleElem.innerText.trim(),
                    location: location || "Trường",
                    description: descText,
                    start: toIcsTimestamp(rawDateId, timeRange.start),
                    end: toIcsTimestamp(rawDateId, timeRange.end)
                });
            });
        });
        return events;
    }
    function parseNoDetailSchedule() {
        const events = [];
        document.querySelectorAll("#tblTKBKhongLichChiTiet tbody tr").forEach(function(row) {
            if (row.classList.contains("empty-state-row")) return;
            const c = row.querySelectorAll("td");
            if (c.length < 5) return;
            const code = c[0] && c[0].innerText.trim() || "";
            const name = c[1] && c[1].innerText.trim() || "";
            const type = c[2] && c[2].innerText.trim() || "";
            const startStr = c[3] && c[3].innerText.trim() || "";
            const endStr = c[4] && c[4].innerText.trim() || "";
            const note = c[5] && c[5].innerText.trim() || "";
            if (!name || !startStr || !endStr) return;
            events.push({
                uid: "nondetail_" + code + "_" + toDateOnly(startStr) + "@pka",
                title: "[" + (type || "HP") + "] " + name,
                location: "Trường / Cơ sở thực tập",
                description: "Mã HP: " + code + " | Ghi chú: " + note,
                isAllDay: true,
                startDate: toDateOnly(startStr),
                endDate: toDateOnly(endStr)
            });
        });
        return events;
    }
    function parseAllPossibleExamData() {
        const out = [];
        document.querySelectorAll("#tblLichThi tbody tr").forEach(function(row) {
            const td = row.querySelectorAll("td");
            if (td.length < 6) return;
            const type = td[1].innerText.trim(), dateStr = td[2].innerText.trim(), timeStr = td[3].innerText.trim(), room = td[4].innerText.trim() || "Chưa xếp phòng", subject = td[5].innerText.trim();
            const tr = extractTimeRange(timeStr);
            if (!subject || !dateStr || !tr) return;
            out.push({
                uid: "exam_" + toDateOnly(dateStr) + "_" + tr.start.replace(":", "") + "_" + subject.replace(/\s+/g, "").slice(0, 20) + "@pka",
                title: "[THI] " + subject,
                location: room,
                description: "Hình thức: " + type + " | Phòng: " + room + " | Giờ: " + timeStr,
                start: toIcsTimestamp(dateStr, tr.start),
                end: toIcsTimestamp(dateStr, tr.end)
            });
        });
        document.querySelectorAll("#tblLichThiCaNhan tbody tr").forEach(function(row) {
            const td = row.querySelectorAll("td");
            if (td.length < 8) return;
            const code = td[1].innerText.trim(), subject = td[2].innerText.trim(), dateStr = td[4].innerText.trim(), timeStr = td[5].innerText.trim(), type = td[6].innerText.trim(), room = td[7].innerText.trim() || "Chưa xếp phòng", sbd = td[8] ? td[8].innerText.trim() : "";
            const tr = extractTimeRange(timeStr);
            if (!subject || !dateStr || !tr) return;
            out.push({
                uid: "exam_" + toDateOnly(dateStr) + "_" + tr.start.replace(":", "") + "_" + subject.replace(/\s+/g, "").slice(0, 20) + "@pka",
                title: "[THI] " + subject,
                location: room,
                description: "Mã HP: " + code + " | SBD: " + sbd + " | Hình thức: " + type + " | Phòng: " + room,
                start: toIcsTimestamp(dateStr, tr.start),
                end: toIcsTimestamp(dateStr, tr.end)
            });
        });
        return out;
    }
    async function crawlFullSemesterAndExams(onProgress) {
        onProgress = onProgress || function() {};
        const all = new Map;
        parseAllPossibleExamData().forEach(function(e) {
            all.set(e.uid, e);
        });
        parseNoDetailSchedule().forEach(function(e) {
            all.set(e.uid, e);
        });
        for (let mth = 1; mth <= 3; mth++) {
            const monthEl = document.getElementById("thang");
            const monthName = monthEl && monthEl.innerText || "Tháng " + mth;
            const dayItems = Array.prototype.slice.call(document.querySelectorAll(".calendar-block-cover ul.days li.poiter"));
            const seen = new Set, weeks = [];
            dayItems.forEach(function(li) {
                const wId = li.getAttribute("name");
                if (wId && !seen.has(wId)) {
                    seen.add(wId);
                    weeks.push(li);
                }
            });
            if (!weeks.length) {
                parseWeeklyGridSchedule().forEach(function(e) {
                    all.set(e.uid, e);
                });
            }
            for (let i = 0; i < weeks.length; i++) {
                onProgress("[" + mth + "/3] " + monthName + ": quét tuần " + (i + 1) + "/" + weeks.length + "…");
                if (!weeks[i].classList.contains("active")) {
                    weeks[i].click();
                    await wait(280);
                }
                parseWeeklyGridSchedule().forEach(function(e) {
                    all.set(e.uid, e);
                });
                parseAllPossibleExamData().forEach(function(e) {
                    all.set(e.uid, e);
                });
            }
            if (mth < 3) {
                const nextBtn = document.querySelector(".next-prev-month.month a.next");
                if (!nextBtn) break;
                const oldMonth = document.getElementById("thang") && document.getElementById("thang").getAttribute("title");
                nextBtn.click();
                let retry = 0;
                while (retry < 12) {
                    await wait(60);
                    const cur = document.getElementById("thang") && document.getElementById("thang").getAttribute("title");
                    if (cur && cur !== oldMonth) break;
                    retry++;
                }
                await wait(200);
            }
        }
        return Array.from(all.values());
    }
    function hasEduApi() {
        return !!(window.edu && edu.system && edu.system.makeRequest && edu.system.userId);
    }
    function apiCall(req) {
        return new Promise(function(resolve) {
            try {
                edu.system.makeRequest({
                    success: function(d) { resolve(d && d.Success && d.Data ? d.Data : []); },
                    error: function() { resolve([]); },
                    type: req.type || "POST", action: req.action, contentType: true, data: req, fakedb: []
                }, false, false, false, null);
            } catch (error_) { resolve([]); }
        });
    }
    function ddmmyyyy(dt) {
        const p = function(n) { return String(n).padStart(2, "0"); };
        return p(dt.getDate()) + "/" + p(dt.getMonth() + 1) + "/" + dt.getFullYear();
    }
    function apiItemToEvent(e) {
        const parts = String(e.NGAYHOC || "").split("/");
        if (parts.length !== 3) return null;
        const isExam = String(e.PHANLOAI || "").toUpperCase() === "LICHTHI";
        const p = function(n) { return String(n == null ? 0 : n).padStart(2, "0"); };
        const y = parts[2], m = p(parts[1]), d = p(parts[0]);
        const start = y + m + d + "T" + p(e.GIOBATDAU) + p(e.PHUTBATDAU) + "00";
        const end = y + m + d + "T" + p(e.GIOKETTHUC) + p(e.PHUTKETTHUC) + "00";
        const room = e.PHONGHOC_TEN || e.TENPHONGHOC || e.PHONGTHI || "";
        const subject = e.TENHOCPHAN || "(môn)";
        const desc = [ e.TENLOPHOCPHAN ? "Lớp: " + e.TENLOPHOCPHAN : "", e.DANGKY_LOPHOCPHAN_TEN ? "Hình thức: " + e.DANGKY_LOPHOCPHAN_TEN : "", e.TIETBATDAU && e.TIETKETTHUC ? "Tiết " + e.TIETBATDAU + "-" + e.TIETKETTHUC : "" ].filter(Boolean).join(" | ");
        return {
            uid: (isExam ? "exam_" : "study_") + y + m + d + "_" + p(e.GIOBATDAU) + p(e.PHUTBATDAU) + "_" + subject.replace(/\s+/g, "").slice(0, 20) + "@pka",
            title: (isExam ? "[THI] " : "[HỌC] ") + subject,
            location: room || (isExam ? "Chưa xếp phòng" : "Trường"),
            description: desc,
            start: start,
            end: end
        };
    }
    function svReq(a, b) {
        return { action: "SV_ThongTin_MH/DSA4BRINKCIpAiAPKSAv", func: "pkg_congthongtin_hssv_thongtin.LayDSLichCaNhan", iM: edu.system.iM, strQLSV_NguoiHoc_Id: edu.system.userId, strNgayBatDau: a, strNgayKetThuc: b, type: "POST" };
    }
    function cbReq(a, b) {
        return { action: "NS_ThongTinCanBo/LayDSLichGiang", type: "GET", strNhanSu_HoSoCanBo_Id: edu.system.userId, strNgayBatDau: a, strNgayKetThuc: b, strNgayDangChon: a };
    }
    async function fetchScheduleViaApi(onProgress) {
        onProgress = onProgress || function() {};
        if (!hasEduApi()) return null;
        const startD = new Date;
        startD.setDate(startD.getDate() - 45);
        const endD = new Date;
        endD.setDate(endD.getDate() + 135);
        const win7 = function (d0) { const b = new Date(d0); b.setDate(b.getDate() + 6); return ddmmyyyy(b); };
        const first = ddmmyyyy(startD);
        let mode = null;
        if (edu.system.iM && (await apiCall(svReq(first, win7(startD)))).length) mode = "SV";
        else if ((await apiCall(cbReq(first, win7(startD)))).length) mode = "CB";
        if (!mode) return null;
        const all = new Map;
        const totalWeeks = Math.max(1, Math.ceil((endD - startD) / 6048e5));
        let w = 0;
        for (const cur = new Date(startD); cur <= endD; cur.setDate(cur.getDate() + 7)) {
            w++;
            onProgress("Đang lấy lịch qua API… " + w + "/" + totalWeeks);
            const a = ddmmyyyy(cur);
            const arr = mode === "SV" ? await apiCall(svReq(a, win7(cur))) : await apiCall(cbReq(a, win7(cur)));
            arr.forEach(function(e) { const ev = apiItemToEvent(e); if (ev) all.set(ev.uid, ev); });
        }
        return Array.from(all.values());
    }
    function buildIcs(events) {
        const L = [ "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Phenikaa Calendar//Phenikaa Schedule//VN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "BEGIN:VTIMEZONE", "TZID:Asia/Ho_Chi_Minh", "X-LIC-LOCATION:Asia/Ho_Chi_Minh", "BEGIN:STANDARD", "TZOFFSETFROM:+0700", "TZOFFSETTO:+0700", "TZNAME:+07", "DTSTART:19700101T000000", "END:STANDARD", "END:VTIMEZONE" ];
        events.forEach(function(ev) {
            L.push("BEGIN:VEVENT");
            L.push("UID:" + icsEscape(ev.uid));
            L.push("DTSTAMP:" + dtStampUtc());
            if (ev.isAllDay) {
                L.push("DTSTART;VALUE=DATE:" + ev.startDate);
                L.push("DTEND;VALUE=DATE:" + nextDay(ev.endDate));
            } else {
                L.push("DTSTART;TZID=Asia/Ho_Chi_Minh:" + ev.start);
                L.push("DTEND;TZID=Asia/Ho_Chi_Minh:" + ev.end);
            }
            L.push("SUMMARY:" + icsEscape(ev.title));
            L.push("LOCATION:" + icsEscape(ev.location));
            L.push("DESCRIPTION:" + icsEscape(ev.description));
            L.push("STATUS:CONFIRMED");
            if (!ev.isAllDay) {
                const isExam = ev.title.includes("[THI]");
                L.push("BEGIN:VALARM");
                L.push("TRIGGER:" + (isExam ? "-PT60M" : "-PT15M"));
                L.push("DESCRIPTION:" + (isExam ? "Nhắc nhở giờ thi" : "Nhắc nhở vào lớp"));
                L.push("ACTION:DISPLAY");
                L.push("END:VALARM");
            }
            L.push("END:VEVENT");
        });
        L.push("END:VCALENDAR");
        return L.map(foldLine).join("\r\n");
    }
    function downloadIcs(events, filename) {
        const blob = new Blob([ buildIcs(events) ], {
            type: "text/calendar;charset=utf-8"
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(function() {
            URL.revokeObjectURL(url);
        }, 4e3);
        return url;
    }
    function fmtDate(y) {
        return y.slice(0, 4) + "-" + y.slice(4, 6) + "-" + y.slice(6, 8);
    }
    function fmtDateTime(s) {
        return s.slice(0, 4) + "-" + s.slice(4, 6) + "-" + s.slice(6, 8) + "T" + s.slice(9, 11) + ":" + s.slice(11, 13) + ":" + s.slice(13, 15);
    }
    function toGoogleEvent(ev) {
        const g = {
            iCalUID: ev.uid,
            summary: ev.title,
            location: ev.location || "",
            description: ev.description || "",
            source: {
                title: "Phenikaa Calendar",
                url: "https://qldtbeta.phenikaa-uni.edu.vn/"
            }
        };
        if (ev.isAllDay) {
            g.start = {
                date: fmtDate(ev.startDate)
            };
            g.end = {
                date: fmtDate(nextDay(ev.endDate))
            };
            g.reminders = {
                useDefault: true
            };
        } else {
            const isExam = ev.title.includes("[THI]");
            g.start = {
                dateTime: fmtDateTime(ev.start),
                timeZone: "Asia/Ho_Chi_Minh"
            };
            g.end = {
                dateTime: fmtDateTime(ev.end),
                timeZone: "Asia/Ho_Chi_Minh"
            };
            g.reminders = {
                useDefault: false,
                overrides: [ {
                    method: "popup",
                    minutes: isExam ? 60 : 15
                } ]
            };
        }
        return g;
    }
    function b64urlEncode(str) {
        return btoa(unescape(encodeURIComponent(str))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    }
    function b64urlDecode(str) {
        str = str.replace(/-/g, "+").replace(/_/g, "/");
        while (str.length % 4) str += "=";
        return decodeURIComponent(escape(atob(str)));
    }
    function syncUrl() {
        return window.PKA_SYNC_URL || "sync.html";
    }
    function appUrl() {
        return window.PKA_APP_URL || "app.html";
    }
    function originOf(url) {
        try {
            return new URL(url, location.href).origin;
        } catch (e) {
            return "*";
        }
    }
    function openSync(events) {
        const full = syncUrl() + "#e=" + b64urlEncode(JSON.stringify(events));
        return !!window.open(full, "_blank");
    }
    function openViewerWindow() {
        return window.open(syncUrl(), "_blank");
    }
    function openAppWindow(offline) {
        return window.open(appUrl() + (offline ? "#offline" : ""), "pka_app");
    }
    function isOnQldt() {
        return /qldtbeta\.phenikaa-uni\.edu\.vn/i.test(location.host);
    }
    function isMobileDevice() {
        try {
            return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
                (window.matchMedia && window.matchMedia("(pointer:coarse)").matches);
        } catch (error_) { return false; }
    }
    function openIcsFile(events) {
        const blob = new Blob([ buildIcs(events) ], { type: "text/calendar;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.target = "_blank";
        a.rel = "noopener";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(function() { URL.revokeObjectURL(url); }, 3e4);
    }
    function scheduleUrl() {
        if (window.PKA_SCHEDULE_URL) return window.PKA_SCHEDULE_URL;
        const m = /\/(congsinhvien|conggiangvien)\//i.exec(location.pathname);
        const portal = m ? m[1] : "congsinhvien";
        return location.origin + "/" + portal + "/index.aspx#lichhoc";
    }
    function gotoSchedule() {
        const link = document.querySelector('a[href*="lichhoc" i],a[href*="thoikhoabieu" i],[onclick*="lichhoc" i],[data-module*="lichhoc" i]');
        if (link) { try { link.click(); } catch (error_) {} }
        if (!/lichhoc/i.test(location.hash)) { try { location.hash = "#lichhoc"; } catch (error_) {} }
    }
    async function waitForPortal(ms) {
        const t0 = Date.now();
        while (Date.now() - t0 < ms) {
            if (onPortal()) return true;
            await wait(300);
        }
        return onPortal();
    }
    function sendEventsTo(win, events, targetUrl) {
        if (!win) return;
        const origin = originOf(targetUrl || syncUrl());
        const target = origin === "null" || origin === "*" ? "*" : origin;
        const payload = {
            type: "pka-events",
            events: events
        };
        let acked = false, tries = 0;
        function onMsg(e) {
            if (e.source === win && e.data === "pka-ack") {
                acked = true;
                window.removeEventListener("message", onMsg);
            }
        }
        window.addEventListener("message", onMsg);
        try {
            win.postMessage(payload, target);
        } catch (error_) {}
        const t = setInterval(function() {
            tries++;
            try {
                win.postMessage(payload, target);
            } catch (error_) {}
            if (acked || tries > 60) {
                clearInterval(t);
                window.removeEventListener("message", onMsg);
            }
        }, 300);
    }
    function saveOfflineLocal(events) {
        try {
            localStorage.setItem("pka:schedule", JSON.stringify(events));
            localStorage.setItem("pka:schedule:updated", (new Date).toISOString());
            return true;
        } catch (e) {
            return false;
        }
    }
    function onPortal() {
        return !!(document.querySelector(".calendar-week-table") || document.querySelector("#tblLichThi") || document.querySelector("#tblLichThiCaNhan") || document.querySelector("#tblTKBKhongLichChiTiet"));
    }
    function sigOf(events) {
        return events.map(function(e) {
            return (e.uid || "") + "|" + (e.start || e.startDate || "") + "|" + (e.end || e.endDate || "") + "|" + (e.title || "") + "|" + (e.location || "");
        }).sort().join("\n");
    }
    function currentWeekKey() {
        const first = document.querySelector(".calendar-week-table .date-body .day-of-week");
        return first ? first.id.replace("row", "") : "";
    }
    function detectChanges(storage) {
        const changes = [];
        const week = parseWeeklyGridSchedule();
        if (week.length) {
            const wk = currentWeekKey() || "cur";
            const key = "pka:wk:" + wk;
            const now = sigOf(week);
            const prev = storage.get(key);
            if (prev && prev !== now) changes.push({
                scope: "Lịch học tuần",
                key: wk,
                count: week.length
            });
            storage.set(key, now);
        }
        const exams = parseAllPossibleExamData();
        if (exams.length) {
            const esig = sigOf(exams);
            const eprev = storage.get("pka:exams");
            if (eprev && eprev !== esig) changes.push({
                scope: "Lịch thi",
                key: "exams",
                count: exams.length
            });
            storage.set("pka:exams", esig);
        }
        return changes;
    }
    function parseYMD(s) {
        return new Date(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8));
    }
    function parseYMDT(s) {
        return new Date(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8), +s.slice(9, 11), +s.slice(11, 13));
    }
    function mondayOf(d) {
        const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
        x.setDate(x.getDate() - (x.getDay() + 6) % 7);
        return x;
    }
    function addDays(d, n) {
        const x = new Date(d);
        x.setDate(x.getDate() + n);
        return x;
    }
    function sameDay(a, b) {
        return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
    }
    function dd2(n) {
        return (n < 10 ? "0" : "") + n;
    }
    function fmtDM(d) {
        return dd2(d.getDate()) + "/" + dd2(d.getMonth() + 1);
    }
    function fmtISO(d) {
        return d.getFullYear() + "-" + dd2(d.getMonth() + 1) + "-" + dd2(d.getDate());
    }
    function hhmm(s) {
        return s.slice(9, 11) + ":" + s.slice(11, 13);
    }
    function kindOf(ev) {
        return ev.title.includes("[THI]") ? "thi" : ev.title.includes("[HỌC]") ? "hoc" : "other";
    }
    function cleanTitle(t) {
        return t.replace(/^\[[^\]]+\]\s*/, "");
    }
    function escHtml(s) {
        return String(s == null ? "" : s).replace(/[&<>"]/g, function(c) {
            return {
                "&": "&amp;",
                "<": "&lt;",
                ">": "&gt;",
                '"': "&quot;"
            }[c];
        });
    }
    function inDay(ev, d) {
        if (ev.isAllDay) {
            return d >= parseYMD(ev.startDate) && d <= parseYMD(ev.endDate);
        }
        return sameDay(parseYMDT(ev.start), d);
    }
    function weekEventsOf(monday, list) {
        return list.filter(function(ev) {
            for (let i = 0; i < 7; i++) if (inDay(ev, addDays(monday, i))) return true;
            return false;
        });
    }
    let vRoot = null, vEvents = [], vMonday = null, vMode = "week";
    const DOW = [ "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7", "Chủ nhật" ];
    function vScopeEvents() {
        const el = vRoot && vRoot.querySelector('input[name="pka-vscope"]:checked');
        const v = el ? el.value : "all";
        if (v === "week") return weekEventsOf(vMonday, vEvents);
        if (v === "exam") return vEvents.filter(function(e) {
            return e.title.includes("[THI]");
        });
        return vEvents;
    }
    function vStatus(m) {
        const s = vRoot && vRoot.querySelector(".pka-vstatus");
        if (s) s.textContent = m || "";
    }
    function renderExamList(grid) {
        grid.classList.add("pka-vlist");
        grid.innerHTML = "";
        const now = new Date;
        const exams = vEvents.filter(function(e) {
            return kindOf(e) === "thi" && !e.isAllDay && parseYMDT(e.end) >= now;
        }).sort(function(a, b) {
            return a.start.localeCompare(b.start);
        });
        if (!exams.length) {
            grid.innerHTML = '<div class="pka-vempty">Không có lịch thi sắp tới.</div>';
            return;
        }
        exams.forEach(function(ev) {
            const d = parseYMDT(ev.start);
            const el = document.createElement("div");
            el.className = "pka-ev thi";
            el.innerHTML = '<div class="tm">' + fmtDM(d) + "/" + d.getFullYear() + " · " + hhmm(ev.start) + "–" + hhmm(ev.end) + "</div>" + '<div class="sm"><span class="pka-tag thi">THI</span>' + escHtml(cleanTitle(ev.title)) + "</div>" + (ev.location ? '<div class="lc">📍 ' + escHtml(ev.location) + "</div>" : "");
            grid.appendChild(el);
        });
    }
    function renderViewer() {
        if (!vRoot) return;
        vRoot.querySelectorAll(".pka-vmode").forEach(function(b) {
            b.classList.toggle("on", b.dataset.mode === vMode);
        });
        const weeknav = vRoot.querySelector(".pka-weeknav");
        const bandEl = vRoot.querySelector(".pka-vband");
        const gridEl = vRoot.querySelector(".pka-vgrid");
        if (vMode === "exam") {
            weeknav.hidden = true;
            bandEl.hidden = true;
            bandEl.innerHTML = "";
            renderExamList(gridEl);
            return;
        }
        weeknav.hidden = false;
        bandEl.hidden = false;
        gridEl.classList.remove("pka-vlist");
        const sun = addDays(vMonday, 6), today = new Date;
        vRoot.querySelector(".pka-vrange").textContent = "Tuần " + fmtDM(vMonday) + " – " + fmtDM(sun) + "/" + sun.getFullYear();
        vRoot.querySelector(".pka-vjump").value = fmtISO(vMonday);
        const band = vRoot.querySelector(".pka-vband");
        band.innerHTML = "";
        weekEventsOf(vMonday, vEvents).filter(function(ev) {
            return ev.isAllDay;
        }).forEach(function(ev) {
            const a = parseYMD(ev.startDate), b = parseYMD(ev.endDate);
            const el = document.createElement("div");
            el.className = "pka-ad";
            el.innerHTML = "<b>" + escHtml(cleanTitle(ev.title)) + "</b> <span>(" + fmtDM(a) + "/" + a.getFullYear() + " → " + fmtDM(b) + "/" + b.getFullYear() + ")" + (ev.location ? " · 📍 " + escHtml(ev.location) : "") + "</span>";
            band.appendChild(el);
        });
        const grid = vRoot.querySelector(".pka-vgrid");
        grid.innerHTML = "";
        for (let i = 0; i < 7; i++) {
            const day = addDays(vMonday, i);
            const col = document.createElement("div");
            col.className = "pka-vday" + (sameDay(day, today) ? " today" : "");
            col.innerHTML = '<div class="pka-vdh">' + DOW[i] + " · " + fmtDM(day) + "</div>";
            const body = document.createElement("div");
            body.className = "pka-vbody";
            const list = vEvents.filter(function(ev) {
                return !ev.isAllDay && inDay(ev, day);
            });
            list.sort(function(a, b) {
                const ka = hhmm(a.start), kb = hhmm(b.start);
                return ka < kb ? -1 : ka > kb ? 1 : 0;
            });
            if (!list.length) {
                col.classList.add("pka-vday-empty");
                body.innerHTML = '<div class="pka-vempty">— nghỉ —</div>';
            } else list.forEach(function(ev) {
                const k = kindOf(ev), tag = k === "thi" ? "THI" : k === "hoc" ? "HỌC" : "HP";
                const c = document.createElement("div");
                c.className = "pka-ev " + k;
                c.innerHTML = '<div class="tm">' + hhmm(ev.start) + "–" + hhmm(ev.end) + "</div>" + '<div class="sm"><span class="pka-tag ' + k + '">' + tag + "</span>" + escHtml(cleanTitle(ev.title)) + "</div>" + (ev.location ? '<div class="lc">📍 ' + escHtml(ev.location) + "</div>" : "");
                body.appendChild(c);
            });
            col.appendChild(body);
            grid.appendChild(col);
        }
    }
    function viewerBodyHTML(mode) {
        const save = mode === "overlay" ? '<button class="pka-vsave">💾 Lưu offline</button>' : "";
        const gg = window.PKA_GOOGLE_ENABLED === true ? '<button class="pka-vgg">☁️ Đồng bộ (API)</button>' : "";
        return "" + '<div class="pka-vnav">' + '<div class="pka-vmodes">' + '<button class="pka-vmode on" data-mode="week">📅 Tuần</button>' + '<button class="pka-vmode" data-mode="exam">📝 Lịch thi</button>' + "</div>" + '<div class="pka-weeknav">' + '<button data-nav="prev" title="Tuần trước">‹</button>' + '<button data-nav="today">Hôm nay</button>' + '<button data-nav="next" title="Tuần sau">›</button>' + '<input type="date" class="pka-vjump" aria-label="Nhảy tới ngày">' + '<span class="pka-vrange"></span>' + "</div>" + "</div>" + '<div class="pka-vband"></div>' + '<div class="pka-vgrid"></div>' + '<div class="pka-vfoot">' + '<div class="pka-vscope">Phạm vi: ' + '<label><input type="radio" name="pka-vscope" value="all" checked> Cả học kỳ</label>' + '<label><input type="radio" name="pka-vscope" value="week"> Tuần đang xem</label>' + '<label><input type="radio" name="pka-vscope" value="exam"> Chỉ lịch thi</label>' + "</div>" + '<div class="pka-vact">' + '<button class="pka-vimport">📥 Google Calendar</button>' + '<button class="pka-vics">⬇️ Tải .ics</button>' + gg + save + "</div>" + '<div class="pka-vstatus"></div>' + "</div>";
    }
    function wireViewer(root) {
        root.querySelectorAll(".pka-vmode").forEach(function(b) {
            b.addEventListener("click", function() {
                vMode = b.dataset.mode;
                renderViewer();
            });
        });
        root.querySelector('[data-nav="prev"]').addEventListener("click", function() {
            vMonday = addDays(vMonday, -7);
            renderViewer();
        });
        root.querySelector('[data-nav="next"]').addEventListener("click", function() {
            vMonday = addDays(vMonday, 7);
            renderViewer();
        });
        root.querySelector('[data-nav="today"]').addEventListener("click", function() {
            vMonday = mondayOf(new Date);
            renderViewer();
        });
        const jump = root.querySelector(".pka-vjump");
        jump.addEventListener("click", function() {
            try { this.showPicker(); } catch (error_) {}
        });
        jump.addEventListener("change", function() {
            if (this.value) {
                vMonday = mondayOf(new Date(this.value + "T00:00:00"));
                renderViewer();
            }
        });
        root.querySelector(".pka-vimport").addEventListener("click", function() {
            const ev = vScopeEvents();
            if (!ev.length) {
                vStatus("Phạm vi đang chọn không có sự kiện.");
                return;
            }
            if (isMobileDevice()) {
                openIcsFile(ev);
                vStatus("Đã mở file .ics — chọn “Thêm vào Lịch”. Nếu chỉ thấy chữ, dùng nút ⬇️ Tải .ics.");
            } else {
                downloadIcs(ev, "Phenikaa_ThoiKhoaBieu.ics");
                window.open("https://calendar.google.com/calendar/r/settings/export", "_blank", "noopener");
                vStatus("Đã tải .ics (" + ev.length + " sự kiện). Ở tab Google vừa mở → Nhập & xuất → Nhập → chọn file vừa tải.");
            }
        });
        root.querySelector(".pka-vics").addEventListener("click", function() {
            const ev = vScopeEvents();
            if (!ev.length) {
                vStatus("Phạm vi đang chọn không có sự kiện.");
                return;
            }
            downloadIcs(ev, "Phenikaa_ThoiKhoaBieu.ics");
            vStatus("✅ Đã tải .ics (" + ev.length + " sự kiện). Dùng cho Google/Apple/Outlook.");
        });
        const ggBtn = root.querySelector(".pka-vgg");
        if (ggBtn) ggBtn.addEventListener("click", function() {
            const ev = vScopeEvents();
            if (!ev.length) {
                vStatus("Phạm vi đang chọn không có sự kiện.");
                return;
            }
            if (typeof window.PKA_ON_GOOGLE === "function") {
                window.PKA_ON_GOOGLE(ev, vStatus);
                return;
            }
            const w = openViewerWindow();
            if (!w) {
                vStatus("Trình duyệt chặn tab mới. Hãy cho phép popup rồi thử lại.");
                return;
            }
            sendEventsTo(w, ev, syncUrl());
            vStatus("☁️ Đã mở tab đồng bộ Google với " + ev.length + " sự kiện. Chuyển qua tab đó để cấp quyền.");
        });
        const saveBtn = root.querySelector(".pka-vsave");
        if (saveBtn) saveBtn.addEventListener("click", function() {
            const ev = vScopeEvents();
            if (!ev.length) {
                vStatus("Phạm vi đang chọn không có sự kiện.");
                return;
            }
            const w = openAppWindow();
            if (!w) {
                vStatus("Trình duyệt chặn tab mới. Hãy cho phép popup rồi thử lại.");
                return;
            }
            sendEventsTo(w, ev, appUrl());
            vStatus("💾 Đã mở app offline với " + ev.length + " sự kiện. Ở tab đó chọn 'Thêm vào màn hình chính'.");
        });
    }
    function setViewerEvents(events) {
        vEvents = events || [];
        vMode = "week";
        vMonday = mondayOf(new Date);
    }
    function mountViewer(host, events) {
        injectStyleOnce();
        host.innerHTML = viewerBodyHTML("app");
        host.classList.add("pka-vcontent");
        vRoot = host;
        wireViewer(host);
        setViewerEvents(events);
        renderViewer();
        return host;
    }
    let vShell = null;
    function openOverlay(events) {
        injectStyleOnce();
        if (!vShell) {
            vShell = document.createElement("div");
            vShell.id = "pka-viewer";
            vShell.className = "pka-vwr";
            vShell.innerHTML = '<div class="pka-vbox">' + '<div class="pka-vhd"><b>📆 Thời khóa biểu</b>' + '<button class="pka-vtheme" title="Chuyển sáng/tối">' + themeIcon() + "</button>" + '<span class="pka-vclose" title="Đóng">✕</span></div>' + '<div class="pka-vcontent"></div>' + "</div>";
            document.body.appendChild(vShell);
            const themeBtn = vShell.querySelector(".pka-vtheme");
            themeBtn.addEventListener("click", function() {
                toggleTheme();
                themeBtn.textContent = themeIcon();
            });
            vShell.querySelector(".pka-vclose").addEventListener("click", function() {
                vShell.style.display = "none";
            });
            vShell.addEventListener("click", function(e) {
                if (e.target === vShell) vShell.style.display = "none";
            });
            const content = vShell.querySelector(".pka-vcontent");
            content.innerHTML = viewerBodyHTML("overlay");
            vRoot = content;
            wireViewer(content);
        }
        vRoot = vShell.querySelector(".pka-vcontent");
        setViewerEvents(events);
        renderViewer();
        vShell.style.display = "flex";
    }
    function getSavedTheme() {
        try {
            return localStorage.getItem("pka:theme");
        } catch (e) {
            return null;
        }
    }
    function systemTheme() {
        try {
            return window.matchMedia && window.matchMedia("(prefers-color-scheme:dark)").matches ? "dark" : "light";
        } catch (e) {
            return "light";
        }
    }
    function applyTheme(mode) {
        const t = mode === "light" || mode === "dark" ? mode : getSavedTheme() || systemTheme();
        try {
            document.documentElement.setAttribute("data-pka-theme", t);
        } catch (error_) {}
        if (mode === "light" || mode === "dark") {
            try {
                localStorage.setItem("pka:theme", mode);
            } catch (error_) {}
        }
        return t;
    }
    function currentTheme() {
        try {
            return document.documentElement.getAttribute("data-pka-theme") || (getSavedTheme() || systemTheme());
        } catch (e) {
            return "light";
        }
    }
    function toggleTheme() {
        return applyTheme(currentTheme() === "dark" ? "light" : "dark");
    }
    function themeIcon() {
        return currentTheme() === "dark" ? "☀️" : "🌙";
    }
    function injectStyleOnce() {
        if (document.getElementById("pka-cal-style")) return;
        const css = document.createElement("style");
        css.id = "pka-cal-style";
        css.textContent = "#pka-cal-panel{position:fixed;top:16px;right:16px;z-index:2147483647;width:252px;" + 'font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;background:#f8fafc;' + "color:#333;border:1px solid #cbd5e1;border-radius:10px;padding:12px;" + "box-shadow:0 8px 24px rgba(0,0,0,.18);font-size:13px}" + "#pka-cal-panel .pka-hd{font-weight:700;color:#1e3a8a;margin-bottom:10px;" + "display:flex;align-items:center;justify-content:space-between}" + "#pka-cal-panel #pka-close{cursor:pointer;color:#64748b;font-weight:400;padding:0 4px}" + "#pka-cal-panel .pka-hbtn{margin-left:auto;margin-right:6px;background:transparent;border:none;cursor:pointer;font-size:14px;line-height:1;padding:0}" + "#pka-cal-panel .pka-btn{border:none;border-radius:6px;font-size:13px;font-weight:600;" + "cursor:pointer;padding:9px 10px;color:#fff}" + "#pka-cal-panel .pka-view{width:100%;background:#059669;margin-bottom:8px}" + "#pka-cal-panel .pka-quick{font-size:11px;color:#64748b;margin:4px 0 4px}" + "#pka-cal-panel .pka-row{display:flex;gap:6px}" + "#pka-cal-panel .pka-week{flex:1;background:#2563eb}" + "#pka-cal-panel .pka-exam{flex:1;background:#d97706}" + "#pka-cal-panel .pka-all{flex:1;background:#475569}" + "#pka-cal-panel #pka-status{margin-top:8px;font-size:11.5px;color:#475569;line-height:1.4;min-height:16px}" + "#pka-cal-panel #pka-open{display:block;margin-top:8px;padding:8px;text-align:center;" + "background:#1e3a8a;color:#fff;border-radius:6px;text-decoration:none;font-weight:600}" + "#pka-cal-panel .pka-note{margin-top:8px;padding:7px 9px;border-radius:6px;background:#fef3c7;" + "color:#92400e;font-size:11.5px;line-height:1.4}" + "#pka-cal-fab{position:fixed;bottom:18px;right:18px;z-index:2147483647;width:46px;height:46px;" + "border-radius:50%;background:#059669;color:#fff;border:none;font-size:20px;cursor:pointer;" + "box-shadow:0 6px 18px rgba(0,0,0,.25)}" + "#pka-cal-fab .pka-dot{position:absolute;top:2px;right:2px;width:12px;height:12px;border-radius:50%;" + "background:#ef4444;border:2px solid #fff;display:none}" + ".pka-vwr{position:fixed;inset:0;z-index:2147483647;background:rgba(15,23,42,.55);" + "display:none;align-items:flex-start;justify-content:center;padding:12px;" + 'font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;-webkit-tap-highlight-color:transparent}' + ".pka-vwr *{box-sizing:border-box}" + ".pka-vbox{background:#f8fafc;color:#0f172a;width:100%;max-width:1060px;max-height:94vh;" + "display:flex;flex-direction:column;border-radius:14px;overflow:hidden;box-shadow:0 12px 40px rgba(0,0,0,.35)}" + ".pka-vcontent{display:flex;flex-direction:column;min-height:0;flex:1}" + ".pka-vcontent .pka-vgrid{flex:1;min-height:0}" + ".pka-vhd{display:flex;justify-content:space-between;align-items:center;padding:12px 14px;background:#1e3a8a;color:#fff;font-size:16px}" + ".pka-vhd .pka-vclose{cursor:pointer;font-size:20px;padding:2px 8px;line-height:1}" + ".pka-vhd .pka-vtheme{background:rgba(255,255,255,.18);border:none;color:#fff;font-size:15px;" + "cursor:pointer;padding:5px 10px;border-radius:8px;margin-left:auto;margin-right:8px}" + ".pka-vnav{display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:10px 14px;border-bottom:1px solid #e2e8f0;background:#fff}" + ".pka-weeknav{display:flex;gap:8px;align-items:center;flex-wrap:wrap;flex:1}" + ".pka-weeknav button{border:none;background:#2563eb;color:#fff;border-radius:8px;padding:9px 14px;font-weight:700;font-size:15px;cursor:pointer;min-height:40px}" + '.pka-weeknav button[data-nav="today"]{background:#059669}' + ".pka-vmodes{display:flex;gap:6px}" + ".pka-vmode{border:1px solid #cbd5e1;background:#fff;color:#334155;border-radius:8px;padding:8px 12px;font-weight:700;font-size:14px;cursor:pointer;min-height:40px}" + ".pka-vmode.on{background:#1e3a8a;color:#fff;border-color:#1e3a8a}" + ".pka-vgrid.pka-vlist{display:block}.pka-vlist .pka-ev{margin-bottom:8px}" + ".pka-vnav input[type=date]{padding:9px;border:1px solid #cbd5e1;border-radius:8px;font-size:14px;min-height:40px}" + ".pka-vnav .pka-vrange{font-weight:700;font-size:15px;margin-left:auto}" + ".pka-vband{display:flex;flex-direction:column;gap:6px;padding:10px 14px 0}.pka-vband:empty{display:none}" + ".pka-ad{border-left:4px solid #059669;background:#fff;border:1px solid #e2e8f0;border-left-width:4px;border-radius:6px;padding:7px 10px;font-size:13px}" + ".pka-ad span{color:#64748b;font-size:12px}" + ".pka-vgrid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:8px;padding:12px 14px;overflow:auto}" + ".pka-vday{border:1px solid #e2e8f0;border-radius:10px;background:#fff;overflow:visible;min-height:70px;min-width:0}" + ".pka-vday.today{outline:2px solid #2563eb}" + ".pka-vdh{font-size:12px;font-weight:700;padding:6px 8px;background:#f1f5f9;border-bottom:1px solid #e2e8f0}" + ".pka-vday.today .pka-vdh{background:#dbeafe}" + ".pka-vbody{padding:6px;display:flex;flex-direction:column;gap:6px;min-width:0}" + ".pka-ev{border-left:4px solid #2563eb;background:#f8fafc;border-radius:6px;padding:6px 8px;min-width:0}" + ".pka-ev.hoc{border-left-color:#2563eb}.pka-ev.thi{border-left-color:#dc2626}.pka-ev.other{border-left-color:#059669}" + ".pka-ev .tm{font-size:11px;color:#64748b;font-weight:600}.pka-ev .sm{font-size:12.5px;font-weight:700;margin:1px 0;overflow-wrap:anywhere;white-space:normal}.pka-ev .lc{font-size:11px;color:#64748b;overflow-wrap:anywhere}" + ".pka-vempty{color:#94a3b8;font-size:11px;text-align:center;padding:8px}" + ".pka-tag{display:inline-block;font-size:9px;font-weight:800;padding:1px 5px;border-radius:4px;color:#fff;margin-right:4px}" + ".pka-tag.hoc{background:#2563eb}.pka-tag.thi{background:#dc2626}.pka-tag.other{background:#059669}" + ".pka-vfoot{border-top:1px solid #e2e8f0;background:#fff;padding:10px 14px;display:flex;flex-wrap:wrap;gap:10px 16px;align-items:center}" + ".pka-vscope{font-size:13px;display:flex;gap:12px;align-items:center;flex-wrap:wrap}" + ".pka-vscope label{display:flex;gap:4px;align-items:center;cursor:pointer}" + ".pka-vact{display:flex;gap:10px;flex-wrap:wrap;margin-left:auto}" + ".pka-vact button{border:none;border-radius:9px;padding:11px 16px;font-weight:700;font-size:15px;color:#fff;cursor:pointer;min-height:44px}" + ".pka-vimport{background:#059669}.pka-vics{background:#334155}.pka-vgg{background:#2563eb}.pka-vsave{background:#7c3aed}" + ".pka-vstatus{flex-basis:100%;font-size:12.5px;color:#475569}" + "@media (max-width:760px){" + ".pka-vwr{padding:0}" + ".pka-vbox{max-width:none;max-height:100dvh;height:100dvh;border-radius:0}" + ".pka-vhd{font-size:15px;padding:10px 12px}" + ".pka-vnav{padding:8px 10px;gap:6px}" + ".pka-vmodes{width:100%}.pka-vmode{flex:1}" + ".pka-weeknav{width:100%}.pka-weeknav button{padding:8px 10px;font-size:14px}" + ".pka-vnav input[type=date]{flex:1}" + ".pka-vnav .pka-vrange{flex-basis:100%;margin-left:0;order:5;text-align:center;font-size:14px}" + ".pka-vband{padding:8px 10px 0}" + ".pka-vgrid{display:block;padding:10px;overflow:auto}.pka-vday{min-height:0;margin-bottom:6px}.pka-vday:last-child{margin-bottom:0}" + ".pka-vday-empty .pka-vbody{display:none}.pka-vday-empty .pka-vdh{opacity:.55}" + ".pka-vfoot{padding:8px 10px;gap:6px 10px}" + ".pka-vscope{width:100%;font-size:12.5px;gap:10px}" + ".pka-vact{margin-left:0;width:100%;gap:6px}.pka-vact button{flex:1 1 0;min-width:0;white-space:normal;padding:8px 6px;font-size:13px;min-height:40px}" + ".pka-vstatus{font-size:11.5px}" + "}" + 'html[data-pka-theme="dark"] .pka-vbox{background:#0b1220;color:#e5edf7}' + 'html[data-pka-theme="dark"] .pka-vnav,html[data-pka-theme="dark"] .pka-vfoot{background:#131c2e;border-color:#23324a}' + 'html[data-pka-theme="dark"] .pka-vnav input[type=date]{background:#0b1220;color:#e5edf7;border-color:#23324a}' + 'html[data-pka-theme="dark"] .pka-vmode{background:#131c2e;color:#e5edf7;border-color:#23324a}' + 'html[data-pka-theme="dark"] .pka-ad,html[data-pka-theme="dark"] .pka-vday{background:#131c2e;border-color:#23324a}' + 'html[data-pka-theme="dark"] .pka-vdh{background:#0b1220;border-color:#23324a}' + 'html[data-pka-theme="dark"] .pka-vday.today .pka-vdh{background:#1e293b}' + 'html[data-pka-theme="dark"] .pka-ev{background:#0b1220;border-color:#23324a}' + 'html[data-pka-theme="dark"] .pka-vstatus{color:#94a3b8}' + 'html[data-pka-theme="dark"] .pka-ad span,html[data-pka-theme="dark"] .pka-ev .tm,' + 'html[data-pka-theme="dark"] .pka-ev .lc{color:#94a3b8}' + 'html[data-pka-theme="dark"] #pka-cal-panel{background:#131c2e;color:#e5edf7;border-color:#23324a}' + 'html[data-pka-theme="dark"] #pka-cal-panel .pka-hd{color:#93b4ff}' + 'html[data-pka-theme="dark"] #pka-cal-panel #pka-status{color:#94a3b8}';
        (document.head || document.documentElement).appendChild(css);
        applyTheme();
    }
    let panelEl = null, statusEl = null, noteEl = null, busy = false;
    function setStatus(m) {
        if (statusEl) statusEl.textContent = m;
    }
    function buildPanel() {
        if (panelEl) {
            panelEl.style.display = "block";
            return panelEl;
        }
        injectStyleOnce();
        const wrap = document.createElement("div");
        wrap.id = "pka-cal-panel";
        wrap.innerHTML = '<div class="pka-hd">📅 Phenikaa Calendar' + '<button class="pka-hbtn" id="pka-theme" title="Chuyển sáng/tối">' + themeIcon() + "</button>" + '<span id="pka-close" title="Đóng">✕</span></div>' + '<button class="pka-btn pka-view" id="pka-view">📆 Xem thời khóa biểu &amp; đồng bộ</button>' + '<div id="pka-status">Sẵn sàng.</div>' + '<div class="pka-note" id="pka-note" style="display:none"></div>';
        document.body.appendChild(wrap);
        panelEl = wrap;
        statusEl = wrap.querySelector("#pka-status");
        noteEl = wrap.querySelector("#pka-note");
        wrap.querySelector("#pka-view").addEventListener("click", function() {
            run();
        });
        const tb = wrap.querySelector("#pka-theme");
        tb.addEventListener("click", function() {
            toggleTheme();
            tb.textContent = themeIcon();
        });
        wrap.querySelector("#pka-close").addEventListener("click", function() {
            wrap.style.display = "none";
        });
        return wrap;
    }
    function showNote(msg) {
        buildPanel();
        if (!msg) {
            noteEl.style.display = "none";
            return;
        }
        noteEl.textContent = msg;
        noteEl.style.display = "block";
    }
    async function ensureSchedule() {
        if (onPortal()) return true;
        if (!isOnQldt()) {
            const w0 = openAppWindow(true);
            setStatus(w0 ? "Đã mở tab Thời khóa biểu (lịch đã lưu offline nếu có)." : "Trình duyệt chặn tab. Cho phép popup.");
            return false;
        }
        setStatus("Đang mở trang Lịch học…");
        gotoSchedule();
        if (await waitForPortal(15000)) return true;
        try { sessionStorage.setItem("pka:autoscan", "1"); } catch (error_) {}
        setStatus("Đang chuyển tới trang Lịch học… (nếu không tự quét: mở trang Lịch học rồi bấm lại).");
        location.href = new URL(scheduleUrl(), location.href).href;
        return false;
    }
    async function run() {
        buildPanel();
        if (busy) return;
        busy = true;
        noteEl.style.display = "none";
        try {
            let evAll = null;
            if (isOnQldt() && hasEduApi()) {
                setStatus("Đang lấy lịch qua API…");
                try { evAll = await fetchScheduleViaApi(setStatus); } catch (error_) { evAll = null; }
            }
            if (!evAll || !evAll.length) {
                if (!await ensureSchedule()) return;
                setStatus("Đang quét cả học kỳ… GIỮ NGUYÊN tab này, đừng chuyển tab (vài giây).");
                evAll = await crawlFullSemesterAndExams(setStatus);
            }
            if (!evAll.length) {
                setStatus("Không tìm thấy sự kiện nào để hiển thị.");
                return;
            }
            saveOfflineLocal(evAll);
            if (isMobileDevice()) {
                setStatus("✅ Đã quét " + evAll.length + " sự kiện. Đang mở trang lịch offline…");
                location.href = appUrl() + "#e=" + b64urlEncode(JSON.stringify(evAll));
                return;
            }
            openOverlay(evAll);
            setStatus("✅ Đã hiện thời khóa biểu (" + evAll.length + " sự kiện). Trong cửa sổ: 📥 Google · ⬇️ .ics · 💾 Lưu offline.");
        } catch (e) {
            setStatus("Lỗi: " + (e && e.message ? e.message : e));
        } finally {
            busy = false;
        }
    }
    function openPanel() {
        buildPanel();
        panelEl.style.display = "block";
    }
    window.PKACAL = {
        __ready: true,
        parseWeeklyGridSchedule: parseWeeklyGridSchedule,
        parseNoDetailSchedule: parseNoDetailSchedule,
        parseAllPossibleExamData: parseAllPossibleExamData,
        crawlFullSemesterAndExams: crawlFullSemesterAndExams,
        buildIcs: buildIcs,
        downloadIcs: downloadIcs,
        toGoogleEvent: toGoogleEvent,
        openSync: openSync,
        openViewerWindow: openViewerWindow,
        openAppWindow: openAppWindow,
        sendEventsTo: sendEventsTo,
        openOverlay: openOverlay,
        mountViewer: mountViewer,
        injectStyle: injectStyleOnce,
        applyTheme: applyTheme,
        toggleTheme: toggleTheme,
        currentTheme: currentTheme,
        b64urlEncode: b64urlEncode,
        b64urlDecode: b64urlDecode,
        onPortal: onPortal,
        detectChanges: detectChanges,
        currentWeekKey: currentWeekKey,
        buildPanel: buildPanel,
        openPanel: openPanel,
        showNote: showNote,
        gotoSchedule: gotoSchedule,
        hasEduApi: hasEduApi,
        apiItemToEvent: apiItemToEvent,
        fetchScheduleViaApi: fetchScheduleViaApi,
        run: run
    };
})();
window.PKA_SYNC_URL = "https://hoangnhat-27.github.io/phenikaa-calendar/sync.html";
window.PKA_APP_URL = "https://hoangnhat-27.github.io/phenikaa-calendar/app.html";

(function () {
    "use strict";
    if (!window.PKACAL) return;
    if (window.__PKA_AUTO__) return;
    window.__PKA_AUTO__ = true;
    const P = window.PKACAL;

    function ensureFab() {
        if (document.getElementById("pka-cal-fab")) return;
        if (!document.getElementById("pka-fab-style")) {
            const st = document.createElement("style");
            st.id = "pka-fab-style";
            st.textContent = "#pka-cal-fab{position:fixed;bottom:18px;right:18px;z-index:2147483647;" +
                "width:46px;height:46px;border-radius:50%;background:#059669;color:#fff;border:none;" +
                "font-size:20px;cursor:pointer;box-shadow:0 6px 18px rgba(0,0,0,.25)}";
            (document.head || document.documentElement).appendChild(st);
        }
        const fab = document.createElement("button");
        fab.id = "pka-cal-fab";
        fab.title = "Phenikaa Calendar";
        fab.textContent = "📅";
        fab.addEventListener("click", function () { P.openPanel(); });
        document.body.appendChild(fab);
    }

    function readFlag() {
        try { return sessionStorage.getItem("pka:autoscan"); } catch (error_) { return null; }
    }
    function clearFlag() {
        try { sessionStorage.removeItem("pka:autoscan"); } catch (error_) {}
    }

    ensureFab();

    if (readFlag() && !P.onPortal()) {
        P.gotoSchedule();
    }

    let waited = 0;
    const poll = setInterval(function () {
        waited += 500;
        if (P.onPortal()) {
            clearInterval(poll);
            ensureFab();
            if (readFlag()) { clearFlag(); P.run(); }
        } else if (waited >= 20000) {
            clearInterval(poll);
            clearFlag();
        }
    }, 500);
})();
