(function () {
    "use strict";

    var Lang = "EN_GB";
    var blockedWords = ["6-7", "six seven", "six-seven", "6 7", "6&7", "6 + 7", "6+7", "6 and 7", "6 & 7", "67"];
    var isMuted = false;
    var synth = window.speechSynthesis;
    var mediaElement = document.createElement("audio");
    var chatHistory = [];

    // --- INITIALIZATION ---

    document.addEventListener("DOMContentLoaded", function() {
        // processAll turns the 'data-win-control' div into the actual search bar
        WinJS.UI.processAll().then(function () {
            if ("Notification" in window) {
                Notification.requestPermission();
            }
            
            initializeUI();
            loadHistory();
            loadBackground();
        });
    });

    function initializeUI() {
        var sendBtn = document.getElementById("sendBtn");
        var muteBtn = document.getElementById("muteBtn");
        var bgBtn = document.getElementById("bgBtn");
        
        var autoSuggestElement = document.getElementById("msgInput");
        var autoSuggestControl = autoSuggestElement.winControl;

        // Bing Suggestions logic
        autoSuggestControl.addEventListener("suggestionsrequested", function (e) {
            var queryText = e.detail.queryText;
            var suggestionCollection = e.detail.searchSuggestionCollection;
            
            // Safety Check for Deferral (fixes the Unhandled Exception)
            var deferral = (e.detail.linguisticDetails && e.detail.linguisticDetails.getDeferral) 
                ? e.detail.linguisticDetails.getDeferral() 
                : { complete: function() {} }; 

            if (queryText.length > 0) {
                var url = "https://api.bing.com/osjson.aspx?query=" + encodeURIComponent(queryText);

                fetch(url).then(function(r) { return r.json(); }).then(function (data) {
                    var suggestions = data[1]; 
                    for (var i = 0; i < Math.min(suggestions.length, 5); i++) {
                        suggestionCollection.appendQuerySuggestion(suggestions[i]);
                    }
                    deferral.complete();
                }).catch(function () {
                    deferral.complete();
                });
            } else {
                deferral.complete();
            }
        });

        // Trigger send when user clicks a suggestion or hits Enter
        autoSuggestControl.addEventListener("querysubmitted", function (e) {
            handleSend();
        });

        if(sendBtn) sendBtn.addEventListener("click", handleSend);
        if(muteBtn) muteBtn.addEventListener("click", toggleMute);
        if(bgBtn) bgBtn.addEventListener("click", pickBackground);
    }

    // --- CHAT & SEND LOGIC ---

    function handleSend() {
        var control = document.getElementById("msgInput").winControl;
        // Accessing the text via .queryText because it is a WinJS control
        var rawText = control ? control.queryText.trim() : "";
        
        if (!rawText) return;

        var text = censorText(rawText);
        var lowerText = text.toLowerCase();

        // Clear the input
        control.queryText = "";

        if (text.indexOf("****") !== -1) {
            addMessage("That was rude, Don't say that", "bot");
            addMessage(text, "user");
            return;
        }

        if (["clear", "refresh", "reset", "reload"].indexOf(lowerText) !== -1) {
            clearChat();
            return;
        }

        if (lowerText.indexOf("remind") !== -1 || lowerText.indexOf("reminder") !== -1) {
            addMessage(text, "user");
            handleReminderCommand(text);
            return;
        }

        addMessage(text, "user");

        if (lowerText.indexOf("play ") === 0) {
            var songQuery = text.substring(5);
            playMusic(songQuery);
        } else if (lowerText === "stop") {
            stopMusic();
            addMessage("Music stopped.", "bot");
            speak("Music stopped.");
        } else {
            callAI(text);
        }
    }

    // --- REMINDER LOGIC ---

    function handleReminderCommand(text) {
        var now = new Date();
        var notifyTime = new Date();
        var lowerText = text.toLowerCase();
        var task = "";
        var timeFound = false;

        var relativeMatch = lowerText.match(/in (\d+)\s*(hour|minute|min|second|sec|day)/);
        var absoluteMatch = lowerText.match(/(\d{1,2}):(\d{2})/);

        if (relativeMatch) {
            var amount = parseInt(relativeMatch[1]);
            var unit = relativeMatch[2];
            if (unit.indexOf("hour") !== -1) notifyTime.setHours(now.getHours() + amount);
            else if (unit.indexOf("min") !== -1) notifyTime.setMinutes(now.getMinutes() + amount);
            else if (unit.indexOf("sec") !== -1) notifyTime.setSeconds(now.getSeconds() + amount);
            else if (unit.indexOf("day") !== -1) notifyTime.setDate(now.getDate() + amount);
            timeFound = true;
            task = text.replace(relativeMatch[0], "").replace(/remind me to|set a reminder to|set a reminder|reminder/gi, "").trim();
        } else if (absoluteMatch) {
            var hours = parseInt(absoluteMatch[1]);
            var mins = parseInt(absoluteMatch[2]);
            notifyTime.setHours(hours, mins, 0, 0);
            if (notifyTime < now) notifyTime.setDate(now.getDate() + 1);
            timeFound = true;
            task = text.replace(absoluteMatch[0], "").replace(/remind me to|set a reminder to|set a reminder|reminder/gi, "").trim();
        }

        if (timeFound) {
            if (!task) task = "Scheduled Reminder";
            scheduleReminder(task, notifyTime);
            var timeString = notifyTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            addMessage("Got it! I've set the reminder '" + task + "' at " + timeString + ".", "bot");
            speak("Got it. I'll remind you at " + timeString);
        } else {
            addMessage("I need to know when! Try saying 'in 1 hour' or 'at 15:30'.", "bot");
        }
    }

    function scheduleReminder(text, dueTime) {
        var now = new Date();
        var timeUntil = dueTime - now;
        if (timeUntil > 0) {
            setTimeout(function() {
                if (Notification.permission === "granted") {
                    new Notification("Reminder", { body: text });
                    playPing();
                } else {
                    alert("REMINDER: " + text);
                    playPing();
                }
            }, timeUntil);
        }
    }

    // --- UTILITIES ---

    function censorText(text) {
        var censored = text;
        for (var i = 0; i < blockedWords.length; i++) {
            var regex = new RegExp("\\b" + blockedWords[i] + "\\b", "gi");
            censored = censored.replace(regex, "****");
        }
        return censored;
    }

    function addMessage(text, sender, isLoading) {
        var list = document.getElementById("chatList");
        if(!list) return;

        var row = document.createElement("div");
        row.className = "message-row " + (sender === "user" ? "msg-user-row" : "msg-bot-row");

        var bubble = document.createElement("div");
        bubble.className = "message-bubble " + (sender === "user" ? "msg-user" : "msg-bot");
        bubble.innerText = text;

        row.appendChild(bubble);
        list.appendChild(row);

        chatHistory.push({ role: sender === "user" ? "user" : "model", parts: [{ text: text }] });
        if (!isLoading) saveHistory();

        var container = document.getElementById("chatContainer");
        if(container) container.scrollTop = container.scrollHeight;

        if (sender === "bot" && !isLoading) {
            playPing();
            if (!isMuted) speak(text);
        }
    }

    function saveHistory() {
        var historyToSave = chatHistory.slice(-50);
        localStorage.setItem("drayAiHistory", JSON.stringify(historyToSave));
    }

    function loadHistory() {
        var saved = localStorage.getItem("drayAiHistory");
        if (saved) {
            var items = JSON.parse(saved);
            chatHistory = [];
            items.forEach(function (msg) {
                var sender = (msg.role === "user") ? "user" : "bot";
                addMessage(msg.parts[0].text, sender, true);
            });
        }
    }

    function pickBackground() {
        var input = document.createElement("input");
        input.type = "file";
        input.accept = "image/*";
        input.onchange = function(e) {
            var file = e.target.files[0];
            if (file) {
                var reader = new FileReader();
                reader.onload = function(evt) {
                    var bgUrl = evt.target.result;
                    applyBackground(bgUrl);
                    try { localStorage.setItem("drayAiBgData", bgUrl); } catch(err) {}
                };
                reader.readAsDataURL(file);
            }
        };
        input.click();
    }

    function loadBackground() {
        var bgData = localStorage.getItem("drayAiBgData");
        if (bgData) applyBackground(bgData);
    }

    function applyBackground(url) {
        var container = document.getElementById("chatContainer");
        if(container) {
            container.style.backgroundImage = "url('" + url + "')";
            container.style.backgroundSize = "cover";
            container.style.backgroundAttachment = "fixed";
        }
    }

    function clearChat() {
        localStorage.removeItem("drayAiHistory");
        chatHistory = [];
        document.getElementById("chatList").innerHTML = "";
        localStorage.removeItem("drayAiBgData");
        document.getElementById("chatContainer").style.backgroundImage = "none";
        stopMusic();
        synth.cancel();
    }

    function toggleMute() {
        isMuted = !isMuted;
        var icon = document.getElementById("muteIcon");
        if(icon) icon.innerText = isMuted ? "\uE198" : "\uE15D"; 
        if (isMuted) synth.cancel();
    }

    function speak(text) {
        if (isMuted) return;
        var cleanText = text.replace(/\*.*?\*/g, "").trim();
        if (!cleanText) return;
        synth.cancel();
        var utterance = new SpeechSynthesisUtterance(cleanText);
        synth.speak(utterance);
    }

    function playPing() {
        var ping = document.getElementById("pingSound");
        if (ping) {
            ping.currentTime = 0;
            ping.play().catch(function() {});
        }
    }

    // --- AI INTEGRATION ---

    function callAI(prompt) {
        var geminiUrl = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=AIzaSyAEZaUjOLvCKN9sDJk58YvmTKamBSMQeBk";
        var payload = {
            contents: chatHistory.slice(-20),
            system_instruction: { parts: [{ text: "Respond in the language: " + Lang }] }
        };

        fetch(geminiUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        })
        .then(function(r) { return r.json(); })
        .then(function (data) {
            if (data.candidates) {
                var reply = data.candidates[0].content.parts[0].text;
                addMessage(filterResponseText(reply), "bot");
            }
        })
        .catch(function () { callChatGPT(prompt); });
    }

    function callChatGPT(prompt) {
        var openaiUrl = "https://api.openai.com/v1/chat/completions";
        var recentMsgs = chatHistory.slice(-20).map(function (m) {
            return { role: m.role === "model" ? "assistant" : "user", content: m.parts[0].text };
        });
        recentMsgs.unshift({ role: "system", content: "Respond only in: " + Lang });

        fetch(openaiUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": "Bearer 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"
            },
            body: JSON.stringify({ model: "gpt-4o-mini", messages: recentMsgs })
        })
        .then(function(r) { return r.json(); })
        .then(function (data) {
            var reply = data.choices[0].message.content;
            addMessage(filterResponseText(reply), "bot");
        });
    }

    function filterResponseText(text) {
        return text.replace(/OpenAI|Google/gi, "DraydenYT").replace(/Gemini|ChatGPT/gi, "DrayAI");
    }

    function playMusic(query) {
        var searchUrl = "https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=1&q=" + encodeURIComponent(query) + "&type=video&key=AIzaSyD9-Zah-rzZvWvLMNAMCrNwRN-u3kAB2N0";
        fetch(searchUrl).then(function(r) { return r.json(); }).then(function (data) {
            if (data.items && data.items.length > 0) {
                var videoId = data.items[0].id.videoId;
                document.getElementById("musicPlayer").src = "https://drayaimusichost.netlify.app/?id=" + videoId;
                addMessage("Now playing: " + data.items[0].snippet.title, "bot");
            }
        });
    }

    function stopMusic() {
        document.getElementById("musicPlayer").src = "about:blank";
    }

})();
