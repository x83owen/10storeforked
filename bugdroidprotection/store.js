var searchContain, backBtn, searchBox, appList, appDetailPage, mainContent, sectionTitle, featuredSubtitle, categoryContainer;
var allApps = [];

function setSafeHTML(element, htmlString) {
    if (window.MSApp && window.MSApp.execUnsafeLocalFunction) {
        window.MSApp.execUnsafeLocalFunction(function () {
            element.innerHTML = htmlString;
        });
    } else {
        element.innerHTML = htmlString;
    }
}

function shuffleArray(array) {
    var currentIndex = array.length, temporaryValue, randomIndex;
    while (0 !== currentIndex) {
        randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex -= 1;
        temporaryValue = array[currentIndex];
        array[currentIndex] = array[randomIndex];
        array[randomIndex] = temporaryValue;
    }
    return array;
}

function checkScriptIntegrity() {
    var remoteScriptUrl = 'https://10storedraydenyt.vercel.app/bugdroidprotection/store.js';

    var xhr = new XMLHttpRequest();
    xhr.open('GET', remoteScriptUrl, true);
    xhr.onreadystatechange = function () {
        if (xhr.readyState === 4 && xhr.status === 200) {
            // Normalize: remove carriage returns and trim edges
            var remoteCode = xhr.responseText.replace(/\r/g, "").trim();

            var localXhr = new XMLHttpRequest();
            localXhr.open('GET', 'js/store.js', false);
            localXhr.send();

            // Normalize: remove carriage returns and trim edges
            var localCode = localXhr.responseText.replace(/\r/g, "").trim();

            // Log both to console so you can see the difference if it still fails
            if (remoteCode !== localCode) {
                console.log("Remote length:", remoteCode.length);
                console.log("Local length:", localCode.length);
                handleUnauthorizedModification();
            }
        }
    };
    xhr.send();
}

function handleUnauthorizedModification() {
    showNotification("APP MODIFIED: Security Breach Detected. Closing. We have to do this to prevent bots/bugdroid");

    document.body.style.filter = "grayscale(1) blur(5px)";
    document.body.style.pointerEvents = "none";

    setTimeout(function () {
        window.close();

        window.location.href = "about:blank";
        setSafeHTML(document.body, "<h1 style='color:white;text-align:center;margin-top:20%;'>SESSION TERMINATED - BUGDROID SAFE</h1>");
    }, 3000);
}

function getAppIdFromURL() {
    var search = window.location.search.substring(1);
    if (!search) return null;
    var params = search.split('&');
    for (var i = 0; i < params.length; i++) {
        var pair = params[i].split('=');
        if (decodeURIComponent(pair[0]) === 'id') {
            return decodeURIComponent(pair[1] || '');
        }
    }
    return null;
}

function ajaxGetJSON(url, onSuccess, onError) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.setRequestHeader('Accept', 'application/json');
    xhr.onreadystatechange = function () {
        if (xhr.readyState === 4) {
            if (xhr.status >= 200 && xhr.status < 300) {
                try {
                    var data = JSON.parse(xhr.responseText);
                    onSuccess(data);
                } catch (e) {
                    onError(e);
                }
            } else {
                onError(new Error('Failed to load ' + url + ' (' + xhr.status + ')'));
            }
        }
    };
    xhr.send();
}

function getClosest(elem, selector) {
    for (; elem && elem !== document; elem = elem.parentNode) {
        if (elem.matches) {
            if (elem.matches(selector)) return elem;
        } else if (elem.msMatchesSelector) {
            if (elem.msMatchesSelector(selector)) return elem;
        } else if (elem.webkitMatchesSelector) {
            if (elem.webkitMatchesSelector(selector)) return elem;
        }
    }
    return null;
}

function getAppById(appId) {
    for (var i = 0; i < allApps.length; i++) {
        if (allApps[i].id === appId) return allApps[i];
    }
    return null;
}

function slugifyCategory(category) {
    return category
        .toLowerCase()
        .replace(/\s*\+\s*/g, '-')
        .replace(/\s+/g, '-');
}

function getCategoryFromURL() {
    var search = window.location.search.substring(1);
    if (!search) return null;
    var params = search.split('&');
    for (var i = 0; i < params.length; i++) {
        var pair = params[i].split('=');
        if (decodeURIComponent(pair[0]) === 'category') {
            return decodeURIComponent(pair[1] || '');
        }
    }
    return null;
}

function applyStateFromURL() {
    var appId = getAppIdFromURL();
    var category = getCategoryFromURL() || 'all';

    var links = document.querySelectorAll('.nav-link');
    for (var i = 0; i < links.length; i++) {
        var link = links[i];
        if (link.getAttribute('data-filter') === category) {
            link.classList.add('active');
        } else {
            link.classList.remove('active');
        }
    }

    if (appId) {
        showAppDetail(appId, false);
    } else {
        goBack(false);
        renderAppList(searchBox ? searchBox.value : '', category);
    }
}

function loadCategories() {
    if (!categoryContainer) return;

    ajaxGetJSON('data/all_categories.json', function (data) {
        var appCats = Array.isArray(data.app_categories) ? data.app_categories : [];
        var gameCats = Array.isArray(data.game_categories) ? data.game_categories : [];
        var categories = appCats.concat(gameCats);

        categories = shuffleArray(categories);
        categoryContainer.innerHTML = '';

        for (var i = 0; i < categories.length; i++) {
            var category = categories[i];
            var slug = slugifyCategory(category);

            var li = document.createElement('li');
            li.className = 'nav-item';

            var html = '<a href="#" draggable="false" class="nav-link" data-filter="' + slug + '">' +
                '<span>' + category.toUpperCase() + '</span>' +
                '</a>';

            setSafeHTML(li, html);
            categoryContainer.appendChild(li);
        }
    }, function (error) {
        console.error('Error loading categories:', error);
    });
}

function updateCategoryCounts() {
    if (!allApps || allApps.length === 0) return;

    var counts = { 'all': allApps.length, 'featured': 0, 'type-game': 0, 'type-app': 0 };

    for (var i = 0; i < allApps.length; i++) {
        var app = allApps[i];
        if (app.featured === true) counts.featured++;
        if (app.type === 'game') counts['type-game']++;
        else if (app.type === 'app') counts['type-app']++;
        if (app.category) counts[app.category] = (counts[app.category] || 0) + 1;
    }

    var links = document.querySelectorAll('.nav-link');
    for (var j = 0; j < links.length; j++) {
        var link = links[j];
        var filter = link.getAttribute('data-filter');
        if (!filter) continue;

        var count = counts[filter] !== undefined ? counts[filter] : 0;
        var label = link.querySelector('span');
        if (!label) continue;

        label.textContent = label.textContent.replace(/\s*\(\d+\)$/, '');
        label.textContent += ' (' + count + ')';
    }
}

function fetchApps() {
    ajaxGetJSON('data/apps.json', function (data) {
        if (Object.prototype.toString.call(data) === '[object Array]') {
            allApps = data;
        } else if (data && typeof data === 'object') {
            if (data.apps && Object.prototype.toString.call(data.apps) === '[object Array]') {
                allApps = data.apps;
            } else {
                var foundArray = false;
                for (var key in data) {
                    if (data.hasOwnProperty(key) && Object.prototype.toString.call(data[key]) === '[object Array]') {
                        allApps = data[key];
                        foundArray = true;
                        break;
                    }
                }
                if (!foundArray) allApps = [data];
            }
        }

        var processedApps = [];
        for (var i = 0; i < allApps.length; i++) {
            var app = allApps[i];
            processedApps.push({
                id: app.id || ('app-' + (i + 1)),
                name: app.name || 'Unknown App',
                publisher: app.publisher || 'Unknown Publisher',
                version: app.version || '1.0.0',
                description: app.description || 'No description available.',
                downloadUrl: app.downloadUrl || '#',
                iconUrl: app.iconUrl || 'https://cdn-icons-png.flaticon.com/512/888/888879.png',
                featured: app.featured === true,
                category: slugifyCategory(app.category || 'uncategorized'),
                type: (app.type || 'app').toLowerCase()
            });
        }
        allApps = processedApps;
        allApps = shuffleArray(allApps);

        if (featuredSubtitle) {
            featuredSubtitle.textContent = 'LOADED ' + allApps.length + ' APPS FROM JSON API';
        }

        applyStateFromURL();

        var initialCategory = getCategoryFromURL() || 'all';
        renderAppList('', initialCategory);

    }, function (error) {
        var errHtml = '<div class="error-state"><h3>Error</h3><p>Error: ' + error.message + '</p>' +
                      '<button class="win-button" onclick="location.reload()">Reload</button></div>';
        setSafeHTML(appList, errHtml);
    });
}

function renderAppList(filter, category) {
    filter = filter || '';
    category = category || 'all';

    if (allApps.length === 0) {
        setSafeHTML(appList, '<div class="no-results"><i class="fas fa-box-open"></i><h3>Still Loading</h3><p>Give us a moment will ya?</p></div>');
        return;
    }

    var filteredApps = [];
    var searchTerm = filter.toLowerCase();

    for (var i = 0; i < allApps.length; i++) {
        var app = allApps[i];
        if (app.name === "ChrisRLillo Music") {
            if (app.publisher.indexOf("DraydenYT") === -1) {
                continue;
            }
        }

        var matchesSearch = !filter || (app.name.toLowerCase().indexOf(searchTerm) > -1 ||
                            app.publisher.toLowerCase().indexOf(searchTerm) > -1 ||
                            app.description.toLowerCase().indexOf(searchTerm) > -1);

        var matchesCategory = (category === 'all') ||
                             (category === 'type-game' && app.type === 'game') ||
                             (category === 'type-app' && app.type === 'app') ||
                             (category === 'featured' && app.featured) ||
                             (app.category === category);

        if (matchesSearch && matchesCategory) filteredApps.push(app);
    }

    filteredApps = shuffleArray(filteredApps);

    if (filteredApps.length === 0) {
        setSafeHTML(appList, '<div class="no-results"><i class="fas fa-search"></i><h3>NO APPS FOUND</h3><p>Try a different search term</p></div>');
        return;
    }

    if (sectionTitle) {
        sectionTitle.textContent = category.toUpperCase() + ' (' + filteredApps.length + ')';
    }

    appList.innerHTML = '';

    for (var j = 0; j < filteredApps.length; j++) {
        (function (currentApp) {
            var appItem = document.createElement('div');
            appItem.className = 'app-item ' + (currentApp.featured ? 'featured' : '');

            var itemHtml = '<div class="app-icon-container">' +
                '<img src="' + currentApp.iconUrl + '" alt="' + currentApp.name + '" ' +
                'onerror="this.onerror=null; this.src=\'https://cdn-icons-png.flaticon.com/512/888/888879.png\'">' +
                '</div>' +
                '<div class="app-info-container">' +
                '<h3 class="app-title">' + currentApp.name + '</h3>' +
                '<div class="app-publisher">' + currentApp.publisher + '</div>' +
                '<p class="app-description">' + currentApp.description + '</p>' +
                '<div class="app-meta">' +
                '<span class="meta-badge category">' + currentApp.category.toUpperCase() + '</span> ' +
                '<span class="meta-badge type">' + currentApp.type.toUpperCase() + '</span>' +
                '</div>' +
                '<div class="app-footer">' +
                '<div class="app-version">VERSION ' + currentApp.version + '</div>' +
                '<button class="download-btn" onclick="event.stopPropagation(); window.downloadApp(\'' + currentApp.id + '\')">' +
                '<i class="fas fa-download"></i> DOWNLOAD' +
                '</button></div></div>';

            setSafeHTML(appItem, itemHtml);
            appItem.addEventListener('click', function () { showAppDetail(currentApp.id); });
            appList.appendChild(appItem);
        })(filteredApps[j]);
    }
}

function showAppDetail(appId, updateHistory) {
    var app = getAppById(appId);
    if (!app) return;

    var detailHtml = '<div class="detail-header">' +
        '<div class="detail-icon"><img src="' + app.iconUrl + '" onerror="this.src=\'https://logodix.com/logo/4487.png\'"></div>' +
        '<div class="detail-header-info">' +
        '<h1 class="detail-title">' + app.name + '</h1>' +
        '<div class="detail-publisher">' + app.publisher + '</div>' +
        '<div class="detail-version">Version ' + app.version + '</div>' +
        '<button class="win-button" onclick="window.downloadApp(\'' + app.id + '\')">Install</button>' +
        '</div></div>';

    setSafeHTML(appDetailPage, detailHtml);

    if (updateHistory !== false && window.history.pushState) {
        var newUrl = window.location.pathname + '?id=' + encodeURIComponent(appId);
        window.history.pushState({ appId: appId }, '', newUrl);
    }

    appDetailPage.style.setProperty('display', 'block', 'important');
    mainContent.style.setProperty('display', 'none', 'important');
    backBtn.style.setProperty('display', 'flex', 'important');
    searchContain.style.setProperty('display', 'none', 'important');
}

function goBack(updateHistory) {
    // Update URL back to list view (keeping category if it exists)
    if (updateHistory !== false && window.history.pushState) {
        var category = getCategoryFromURL();
        var newUrl = window.location.pathname + (category ? '?category=' + category : '');
        window.history.pushState({}, '', newUrl);
    }

    appDetailPage.style.setProperty('display', 'none', 'important');
    mainContent.style.setProperty('display', 'block', 'important');
    backBtn.style.setProperty('display', 'none', 'important');
    searchContain.style.setProperty('display', 'flex', 'important');
}

function downloadApp(appId) {
    var app = getAppById(appId);
    if (!app) return;
    if (app.downloadUrl && app.downloadUrl !== '#') {
        window.open(app.downloadUrl, '_blank');
        showNotification('Downloading ' + app.name + '...');
    } else {
        showNotification('"' + app.name + '" - Download Error');
    }
}

function showNotification(message) {
    var existingNotification = document.querySelector('.download-notification');
    if (existingNotification) existingNotification.parentNode.removeChild(existingNotification);

    var notification = document.createElement('div');
    notification.className = 'download-notification';
    notification.style.cssText = 'position: fixed; bottom: 20px; right: 20px; background-color: #107c10; color: white; padding: 16px 24px; z-index: 10000; display: flex; align-items: center;';

    setSafeHTML(notification, '<span style="margin-left: 10px;">' + message + '</span>');
    document.body.appendChild(notification);

    setTimeout(function () {
        if (notification.parentNode) notification.parentNode.removeChild(notification);
    }, 3000);
}

window.addEventListener('load', function () {
    var splash = document.getElementById('splashScreen');

    // Wait 2 seconds before starting the fade
    setTimeout(function () {
        if (splash) {
            splash.classList.add('splash-fade-out');

            // Completely remove from view after the 0.3s animation finishes
            setTimeout(function () {
                splash.style.display = 'none';
            }, 300);
        }
    }, 1000); // 2000ms = 2 seconds
});

document.addEventListener('DOMContentLoaded', function () {
    backBtn = document.getElementById('backBtn');
    searchBox = document.getElementById('searchBox');''
    searchContain = document.getElementById('searchContain');
    appList = document.getElementById('appList');
    appDetailPage = document.getElementById('appDetailPage');
    mainContent = document.getElementById('mainContent');
    sectionTitle = document.getElementById('sectionTitle');
    featuredSubtitle = document.querySelector('.featured-subtitle');
    categoryContainer = document.getElementById('categoryContainer');

    var sidebar = document.querySelector('.sidebar');
    if (sidebar) {
        sidebar.addEventListener('click', function (e) {
            var link = getClosest(e.target, '.nav-link');
            if (!link) return;
            e.preventDefault();
            var category = link.getAttribute('data-filter') || 'all';
            var links = document.querySelectorAll('.nav-link');
            for (var i = 0; i < links.length; i++) links[i].classList.remove('active');
            link.classList.add('active');

            if (window.history && window.history.pushState) {
                var newUrl = window.location.protocol + "//" + window.location.host + window.location.pathname;
                if (category !== 'all') newUrl += '?category=' + encodeURIComponent(category);
                window.history.pushState({ path: newUrl }, '', newUrl);
            }
            renderAppList(searchBox ? searchBox.value : '', category);
        });
    }

    fetchApps();
    loadCategories();
    checkScriptIntegrity();
    setTimeout(applyStateFromURL, 0);

    window.addEventListener('popstate', applyStateFromURL);
    if (backBtn) backBtn.addEventListener('click', function (e) { e.preventDefault(); goBack(); });
    if (searchBox) searchBox.addEventListener('input', function () {
        renderAppList(this.value, getCategoryFromURL() || 'all');
    });

    window.downloadApp = downloadApp;
});
