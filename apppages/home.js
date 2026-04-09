(function () {
    "use strict";

    var featuredApps = [];
    var currentHeroIndex = 0;
    var heroTimer = null;
    var deviceFamily = "Windows.Desktop";

    try {
        if (typeof Windows !== 'undefined') {
            deviceFamily = Windows.System.Profile.AnalyticsInfo.versionInfo.deviceFamily;
        }
    } catch (e) {
        console.warn("WinRT namespaces not found.");
    }

    var isMobile = (deviceFamily === "Windows.Mobile");
    var isPC = (deviceFamily === "Windows.Desktop");

    function getVal(parent, tag) {
        var el = parent.getElementsByTagName(tag)[0];
        return el ? el.textContent : "";
    }

    function moveHero(step) {
        var slides = document.querySelectorAll(".hero-slide");
        if (slides.length <= 1) return;
        slides[currentHeroIndex].classList.remove("active");
        currentHeroIndex = (currentHeroIndex + step + slides.length) % slides.length;
        slides[currentHeroIndex].classList.add("active");
    }

    function startTimer() {
        clearInterval(heroTimer);
        heroTimer = setInterval(function () { moveHero(1); }, 10000);
    }

    function renderHero(container) {
        if (!featuredApps || featuredApps.length === 0) return;
        var heroWrap = document.createElement("div");
        heroWrap.id = "hero-container";

        function isYouTube(url) {
            return /youtu\.be\/|youtube\.com\/watch|youtube\.com\/embed/.test(url);
        }

        function findScreenshot1(appNode) {
            var el = appNode.getElementsByTagName("screenshot1")[0];
            if (el) {
                var v = (el.textContent || el.getAttribute && (el.getAttribute("src") || "") || "").trim();
                if (v) return v;
            }

            var snaps = appNode.getElementsByTagName("screenshot");
            if (snaps && snaps.length) {
                for (var i = 0; i < snaps.length; i++) {
                    var a = snaps[i].getAttribute && (snaps[i].getAttribute("index") || snaps[i].getAttribute("data-index"));
                    if (a && String(a).trim() === "1") {
                        var v2 = (snaps[i].textContent || snaps[i].getAttribute("src") || "").trim();
                        if (v2) return v2;
                    }
                }
                var first = snaps[0];
                var v3 = (first.textContent || first.getAttribute("src") || "").trim();
                if (v3) return v3;
            }

            var all = appNode.getElementsByTagName("*");
            for (var j = 0; j < all.length; j++) {
                var tn = all[j].tagName || "";
                if (tn.toLowerCase().indexOf("screenshot") !== -1) {
                    if (tn.toLowerCase() === "screenshot1") {
                        var vv = (all[j].textContent || all[j].getAttribute("src") || "").trim();
                        if (vv) return vv;
                    }
                }
            }

            return null;
        }

        function normalizeUrl(url) {
            if (!url) return null;
            url = String(url).trim();
            if (!url) return null;
            if (url.indexOf("data:") === 0 || url.indexOf("http://") === 0 || url.indexOf("https://") === 0) return url;
            try {
                var base = document.location.href;
                var a = document.createElement("a");
                a.href = url;
                if (a.href) return a.href;
            } catch (e) {
                // ignore
            }
            return url;
        }

        featuredApps.forEach(function (app, index) {
            var slide = document.createElement("div");
            slide.className = "hero-slide" + (index === 0 ? " active" : "");

            var icon = getVal(app, "icon") || "";
            var name = getVal(app, "name") || "";
            var desc = getVal(app, "description") || getVal(app, "publisher") || "";

            var candidate = null;
            try {
                candidate = findScreenshot1(app);
            } catch (err) {
                console.error("findScreenshot1 error", err);
                candidate = null;
            }

            var bgUrl;

            if (candidate && isYouTube(candidate)) {
                bgUrl = normalizeUrl(icon);
            } else {
                bgUrl = normalizeUrl(candidate) || normalizeUrl(icon) || "";
            }

            if (window && window.console && window.console.log) {
                console.log("renderHero: app id=", app.getAttribute && app.getAttribute("id"), "screenshot1 raw=", candidate, "bgUrl=", bgUrl, "icon=", icon);
            }

            var safeBg = (bgUrl + "").replace(/'/g, "\\'");

            slide.innerHTML =
                '<div class="hero-bg" style="background-image: url(\'' + safeBg + '\')"></div>' +
                '<div class="hero-content">' +
                '<img class="hero-img" src="' + (icon ? icon.replace(/"/g, "&quot;") : "") + '" alt="' + (name ? name.replace(/"/g, "&quot;") : "") + '">' +
                '<div class="hero-text-info">' +
                '<div class="hero-title">' + name + '</div>' +
                '<div class="hero-desc">' + desc + '</div>' +
                '</div>' +
                '</div>';

            slide.onclick = function () {
                var id = app.getAttribute && app.getAttribute("id");
                if (id) window.location.href = 'app.html?id=' + encodeURIComponent(id);
            };

            heroWrap.appendChild(slide);
        });

        var prevBtn = document.createElement("button");
        prevBtn.className = "hero-nav hero-prev";
        prevBtn.innerHTML = "&#10094;";
        prevBtn.onclick = function (e) { e.stopPropagation(); moveHero(-1); startTimer(); };

        var nextBtn = document.createElement("button");
        nextBtn.className = "hero-nav hero-next";
        nextBtn.innerHTML = "&#10095;";
        nextBtn.onclick = function (e) { e.stopPropagation(); moveHero(1); startTimer(); };

        heroWrap.appendChild(prevBtn);
        heroWrap.appendChild(nextBtn);

        container.appendChild(heroWrap);
        startTimer();
    }

    function loadHomeContent() {
        var container = document.getElementById("home-container") || document.body;

        WinJS.xhr({
            url: `${server}`,
            headers: { "Cache-Control": "no-cache" }
        }).then(function (res) {
            try {
                var parser = new DOMParser();
                var xml = parser.parseFromString(res.responseText, "text/xml");

                if (!xml || !container) return;

                container.innerHTML = "";
                featuredApps = [];

                var allApps = xml.getElementsByTagName("app");
                var categories = xml.getElementsByTagName("category");

                for (var j = 0; j < allApps.length; j++) {
                    if (getVal(allApps[j], "featured").toLowerCase().trim() === "true" && isCompatible(allApps[j])) {
                        featuredApps.push(allApps[j]);
                    }
                }

                for (var i = featuredApps.length - 1; i > 0; i--) {
                    var k = Math.floor(Math.random() * (i + 1));
                    var temp = featuredApps[i];
                    featuredApps[i] = featuredApps[k];
                    featuredApps[k] = temp;
                }

                renderHero(container);

                for (var i = 0; i < categories.length; i++) {
                    var catTitle = categories[i].getAttribute("title");
                    var catType = categories[i].getAttribute("type");
                    if (catType === "featured") continue;

                    var grid = document.createElement("div");
                    grid.className = "app-grid";

                    if (catType === "picks") {
                        var appIdsVal = getVal(categories[i], "appIds");
                        var ids = appIdsVal ? appIdsVal.replace(/\s/g, "").split(",") : [];
                        fillGrid(grid, allApps, function (app) {
                            return ids.indexOf(app.getAttribute("id")) !== -1;
                        });
                    }

                    if (grid.hasChildNodes()) {
                        var h2 = document.createElement("div");
                        h2.className = "section-title";
                        h2.textContent = catTitle;
                        container.appendChild(h2);
                        container.appendChild(grid);
                    }
                }

            } catch (err) {
                console.error("Home Loader Error:", err);
            }
        });
    }


    function isCompatible(appNode) {
        var canPC = getVal(appNode, "pcCapable").toLowerCase().trim() === "true";
        var canMobile = getVal(appNode, "mobileCapable").toLowerCase().trim() === "true";
        return (isMobile && canMobile) || (isPC && canPC);
    }

    function fillGrid(grid, apps, filter) {
        var validApps = [];

        // 1. Collect apps that match the filter and compatibility
        for (var j = 0; j < apps.length; j++) {
            if (filter(apps[j]) && isCompatible(apps[j])) {
                validApps.push(apps[j]);
            }
        }

        // 2. Shuffle the array of valid apps
        for (var i = validApps.length - 1; i > 0; i--) {
            var k = Math.floor(Math.random() * (i + 1));
            var temp = validApps[i];
            validApps[i] = validApps[k];
            validApps[k] = temp;
        }

        // 3. Render the shuffled apps
        validApps.forEach(function (app, idx) {
            var wrapper = document.createElement("div");
            wrapper.className = "win-container win-focusable";
            var card = document.createElement("div");
            card.className = "app-card win-item";
            card.style.transitionDelay = (idx * 50) + "ms";
            var id = app.getAttribute("id");

            card.innerHTML =
                '<img class="win-item-image" src="' + getVal(app, "icon") + '">' +
                '<div class="app-card-info">' +
                '<div class="app-name win-type-base win-type-ellipsis">' + getVal(app, "name") + '</div>' +
                '<div class="win-type-caption win-type-ellipsis" style="opacity:0.6;">' + getVal(app, "publisher") + '</div>' +
                '</div>';

            wrapper.onclick = function () {
                window.location.href = 'ms-appx-web:///app.html?id=' + encodeURIComponent(id);
            };

            wrapper.appendChild(card);
            grid.appendChild(wrapper);

            (function (c) {
                setTimeout(function () { c.classList.add("visible"); }, 50);
            })(card);
        });
    }

    if (document.readyState === "complete" || document.readyState === "interactive") {
        loadHomeContent();
    } else {
        document.addEventListener("DOMContentLoaded", loadHomeContent);
    }
})();
