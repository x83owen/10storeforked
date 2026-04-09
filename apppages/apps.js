(function () {
    "use strict";

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

    function getQueryParam(name) {
        name = name.replace(/[\[]/, "\\[").replace(/[\]]/, "\\]");
        var regex = new RegExp("[\\?&]" + name + "=([^&#]*)");
        var results = regex.exec(window.location.search);
        return results === null ? "" : decodeURIComponent(results[1].replace(/\+/g, " "));
    }

    var searchQuery = getQueryParam('search');

    function init() {
        var titleEl = document.getElementById("display-title");
        if (titleEl) {
            titleEl.innerText = searchQuery ? searchQuery : "All apps";
        }


        var grid = document.getElementById("apps-grid");

        WinJS.xhr({
            url: `${server}`,
            headers: { "Cache-Control": "no-cache" }
        }).then(function (res) {
            try {
                var parser = new DOMParser();
                var xmlDoc = parser.parseFromString(res.responseText, "text/xml");
                var allApps = xmlDoc.getElementsByTagName("app");
                var query = searchQuery ? searchQuery.toLowerCase().trim() : null;

                fillGrid(grid, allApps, function (app) {
                    if (!query) return true;

                    var appName = getVal(app, "name").toLowerCase();
                    var appPub = getVal(app, "publisher").toLowerCase();

                    return (
                        appName.indexOf(query) !== -1 ||
                        appPub.indexOf(query) !== -1
                    );
                });

            } catch (err) {
                console.error(err);
            }
        });
    }

    function fillGrid(grid, apps, filter) {
        if (!grid) return;
        grid.innerHTML = "";

        var validApps = [];

        for (var j = 0; j < apps.length; j++) {
            if (filter(apps[j]) && isCompatible(apps[j])) {
                validApps.push(apps[j]);
            }
        }

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
            // The staggered animation delay still works perfectly with the random order
            card.style.transitionDelay = (idx * 50) + "ms";

            var id = app.getAttribute("id");

            card.innerHTML =
                '<img class="win-item-image" src="' + getVal(app, "icon") + '">' +
                '<div class="app-card-info">' +
                '<div class="app-name win-type-base win-type-ellipsis">' + getVal(app, "name") + '</div>' +
                '<div class="win-type-caption win-type-ellipsis" style="opacity:0.6;">' + getVal(app, "publisher") + '</div>' +
                '</div>';

            wrapper.onclick = (function (appId) {
                return function () { window.location.href = 'ms-appx-web:///app.html?id=' + appId; };
            })(id);

            wrapper.appendChild(card);
            grid.appendChild(wrapper);

            (function (c) {
                setTimeout(function () { c.classList.add("visible"); }, 50);
            })(card);
        });

        // 4. Handle empty state
        if (validApps.length === 0) {
            grid.innerHTML = "<div style='padding:20px; opacity:0.6;'>No apps found.</div>";
        }
    }

    function isCompatible(appNode) {
        var canPC = getVal(appNode, "pcCapable").toLowerCase().trim() === "true";
        var canMobile = getVal(appNode, "mobileCapable").toLowerCase().trim() === "true";
        return (isMobile && canMobile) || (isPC && canPC);
    }

    function getVal(parent, tag) {
        var el = parent.getElementsByTagName(tag)[0];
        return el ? el.textContent : "";
    }

    if (document.readyState === "complete" || document.readyState === "interactive") {
        init();
    } else {
        document.addEventListener("DOMContentLoaded", init);
    }
})();
