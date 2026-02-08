(function () {
    "use strict";

    // Removed WinJS and Windows specific variables
    var Lang = "EN_GB";
    var blockedWords = ["6-7", "six seven", "six-seven", "6 7", "6&7", "6 + 7", "6+7", "6 and 7", "6 & 7", "67"];
    var isMuted = false;
    // Replaced Windows SpeechSynthesizer with Web Speech API
    var synth = window.speechSynthesis;
    var mediaElement = document.createElement("audio"); // Kept for music, not needed for speech anymore
    var chatHistory = [];

    // Initialize when the DOM is ready (replaces app.onactivated)
    document.addEventListener("DOMContentLoaded", function() {
        // Request notification permission immediately for reminders
        if ("Notification" in window) {
            Notification.requestPermission();
        }
        
        initializeUI();
        loadHistory();
        loadBackground();
    });

    function initializeUI() {
        var sendBtn = document.getElementById("sendBtn");
        var muteBtn = document.getElementById("muteBtn");
        var bgBtn = document.getElementById("bgBtn");
        var msgInput = document.getElementById("msgInput");

        if(sendBtn) sendBtn.addEventListener("click", handleSend);
        if(muteBtn) muteBtn.addEventListener("click", toggleMute);
        if(bgBtn) bgBtn.addEventListener("click", pickBackground);

        if(msgInput) {
            msgInput.addEventListener("keydown", function (e) {
                if (e.key === "Enter") {
                    handleSend();
                }
            });
        }
    }

    // --- TEXT PROCESSING ---

    function censorText(text) {
        var censored = text;
        for (var i = 0; i < blockedWords.length; i++) {
            var regex = new RegExp("\\b" + blockedWords[i] + "\\b", "gi");
            censored = censored.replace(regex, "****");
        }
        return censored;
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

            // If time has passed today, assume tomorrow
            if (notifyTime < now) {
                notifyTime.setDate(now.getDate() + 1);
            }

            timeFound = true;
            task = text.replace(absoluteMatch[0], "").replace(/remind me to|set a reminder to|set a reminder|reminder/gi, "").trim();
        }

        if (timeFound) {
            if (!task) task = "Scheduled Reminder";
            
            // Web implementation using setTimeout
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
                    new Notification("Reminder", {
                        body: text,
                        icon: "" // Optional: Add icon URL here
                    });
                    playPing();
                } else {
                    // Fallback if notifications aren't allowed
                    alert("REMINDER: " + text);
                    playPing();
                }
            }, timeUntil);
        }
    }

    // --- BACKGROUND & STORAGE ---

    function pickBackground() {
        // Create a hidden file input dynamically
        var input = document.createElement("input");
        input.type = "file";
        input.accept = "image/png, image/jpeg, image/jpg";

        input.onchange = function(e) {
            var file = e.target.files[0];
            if (file) {
                var reader = new FileReader();
                reader.onload = function(evt) {
                    var bgUrl = evt.target.result; // Data URL
                    applyBackground(bgUrl);
                    
                    // Save to localStorage instead of Windows Storage
                    // Note: LocalStorage has size limits (usually 5MB). Large images may fail.
                    try {
                        localStorage.setItem("drayAiBgData", bgUrl);
                    } catch(err) {
                        console.error("Image too large to save to localStorage");
                    }
                };
                reader.readAsDataURL(file);
            }
        };
        input.click();
    }

    function loadBackground() {
        var bgData = localStorage.getItem("drayAiBgData");
        if (bgData) {
            applyBackground(bgData);
        }
    }

    function applyBackground(url) {
        var container = document.getElementById("chatContainer");
        if(container) {
            container.style.backgroundImage = "url('" + url + "')";
            container.style.backgroundSize = "cover";
            container.style.backgroundPosition = "center";
            container.style.backgroundAttachment = "fixed";
        }
    }

    // --- CHAT LOGIC ---

    function handleSend() {
        var input = document.getElementById("msgInput");
        var rawText = input.value.trim();
        if (!rawText) return;

        var text = censorText(rawText);
        var lowerText = text.toLowerCase();

        if (text.indexOf("****") !== -1) {
            addMessage("That was rude, Don't say that", "bot");
            addMessage(text, "user");
            input.value = "";
            return;
        }

        if (["clear", "refresh", "reset", "reload"].indexOf(lowerText) !== -1) {
            clearChat();
            input.value = "";
            return;
        }

        if (lowerText.indexOf("remind") !== -1 || lowerText.indexOf("reminder") !== -1) {
            addMessage(text, "user");
            handleReminderCommand(text);
            input.value = "";
            return;
        }

        addMessage(text, "user");
        input.value = "";

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

    function clearChat() {
        localStorage.removeItem("drayAiHistory");
        chatHistory = [];
        var list = document.getElementById("chatList");
        if(list) list.innerHTML = "";

        localStorage.removeItem("drayAiBgData");
        var container = document.getElementById("chatContainer");
        if(container) container.style.backgroundImage = "none";

        stopMusic();
        if(synth) synth.cancel();
    }

    function toggleMute() {
        isMuted = !isMuted;
        var icon = document.getElementById("muteIcon");
        // Replaced custom font icon with standard emoji/text for web compatibility if needed
        // Assuming your CSS/HTML handles the font family for these codes
        if(icon) icon.innerText = isMuted ? "\uE198" : "\uE15D"; 
        
        if (isMuted) {
            if(synth) synth.cancel();
            mediaElement.pause();
        }
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

        chatHistory.push({
            role: sender === "user" ? "user" : "model",
            parts: [{ text: text }]
        });

        if (!isLoading) saveHistory();

        var container = document.getElementById("chatContainer");
        if(container) container.scrollTop = container.scrollHeight;

        if (sender === "bot" && !isLoading) {
            playPing();
            if (!isMuted) speak(text);
        }
    }

    function saveHistory() {
        // Limit saved history to last 50 items to prevent storage bloat
        var historyToSave = chatHistory.slice(-50);
        localStorage.setItem("drayAiHistory", JSON.stringify(historyToSave));
    }

    function loadHistory() {
        var saved = localStorage.getItem("drayAiHistory");
        if (saved) {
            var items = JSON.parse(saved);
            var list = document.getElementById("chatList");
            if(list) list.innerHTML = "";
            chatHistory = [];
            items.forEach(function (msg) {
                // Determine sender based on role mapping
                var sender = (msg.role === "user") ? "user" : "bot";
                addMessage(msg.parts[0].text, sender, true);
            });
        }
    }

    // --- AI INTEGRATION ---

    function callAI(prompt) {
        var geminiUrl = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=AIzaSyAEZaUjOLvCKN9sDJk58YvmTKamBSMQeBk";

        var recentHistory = chatHistory.slice(-20);

        var payload = {
            contents: recentHistory,
            system_instruction: {
                parts: [{ text: "Respond in the language: " + Lang }]
            }
        };

        // Replaced WinJS.xhr with fetch
        fetch(geminiUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        })
        .then(function(response) {
            return response.json();
        })
        .then(function (data) {
            if (data.candidates && data.candidates.length > 0) {
                var reply = data.candidates[0].content.parts[0].text;
                var filteredReply = filterResponseText(reply);
                addMessage(filteredReply, "bot");
            } else {
                addMessage("I couldn't generate a response.", "bot");
            }
        })
        .catch(function (err) {
            // Fallback to ChatGPT if Gemini fails
            callChatGPT(prompt);
        });
    }

    function callChatGPT(prompt) {
        var openaiUrl = "https://api.openai.com/v1/chat/completions";

        var recentMsgs = chatHistory.slice(-20).map(function (m) {
            return { role: m.role === "model" ? "assistant" : "user", content: m.parts[0].text };
        });

        recentMsgs.unshift({
            role: "system",
            content: "Respond only in this language: " + Lang
        });

        var payload = {
            model: "gpt-4o-mini",
            messages: recentMsgs
        };

        fetch(openaiUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": "Bearer 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"
            },
            body: JSON.stringify(payload)
        })
        .then(function(response) {
            return response.json();
        })
        .then(function (data) {
            var reply = data.choices[0].message.content;
            var filteredReply = filterResponseText(reply);
            addMessage(filteredReply, "bot");
        })
        .catch(function (err) {
            addMessage("Error: Both AI services failed to respond.", "bot");
        });
    }

    function filterResponseText(text) {
        if (!text) return "";
        return text
            .replace(/OpenAI/gi, "DraydenYT")
            .replace(/Google/gi, "DraydenYT")
            .replace(/Gemini/gi, "DrayAI")
            .replace(/ChatGPT/gi, "DrayAI");
    }

    // --- MEDIA ---

    function playPing() {
        var ping = document.getElementById("pingSound");
        if (ping) {
            ping.currentTime = 0;
            ping.play().catch(e => console.log("Audio play failed (interaction required)"));
        }
    }

    function speak(text) {
        if (isMuted) return;
        var cleanText = text.replace(/\*.*?\*/g, "").trim();
        if (!cleanText) return;

        // Web Speech API implementation
        synth.cancel(); // Stop previous speech
        var utterance = new SpeechSynthesisUtterance(cleanText);
        // Optional: Select a voice if needed, otherwise it uses default
        synth.speak(utterance);
    }

    function playMusic(query) {
        var searchUrl = "https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=1&q=" + encodeURIComponent(query) + "&type=video&key=AIzaSyD9-Zah-rzZvWvLMNAMCrNwRN-u3kAB2N0";

        fetch(searchUrl)
        .then(function(response) {
            return response.json();
        })
        .then(function (data) {
            if (data.items && data.items.length > 0) {
                var videoId = data.items[0].id.videoId;
                var rawTitle = data.items[0].snippet.title;
                var cleanTitle = rawTitle.replace(/(\(|\[)?(Official|Music Video|Lyrics|HD|4K)(\)|\])?/gi, "").trim();

                var player = document.getElementById("musicPlayer");
                if(player) {
                    player.src = "https://drayaimusichost.netlify.app/?id=" + videoId;
                }
                addMessage("Now playing: " + cleanTitle, "bot");
            } else {
                addMessage("I couldn't find that song.", "bot");
            }
        })
        .catch(function (err) {
            addMessage("Error searching for music.", "bot");
        });
    }

    function stopMusic() {
        var player = document.getElementById("musicPlayer");
        if(player) player.src = "about:blank";
    }

})();
