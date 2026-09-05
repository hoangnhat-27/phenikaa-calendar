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
