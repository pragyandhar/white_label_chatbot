/*
 * Self-contained embeddable AskGLA chat widget.
 * Embed:
 *   <script src="https://YOURHOST/widget/askgla-widget.js"
 *           data-api-base="https://YOURHOST"
 *           data-dept="admissions"></script>
 */
(function () {
  "use strict";

  if (window.__askglaWidgetLoaded) return;
  window.__askglaWidgetLoaded = true;

  var scriptEl   = document.currentScript;
  var API_BASE   = (scriptEl && scriptEl.getAttribute("data-api-base") || "").replace(/\/+$/, "");
  var DEPARTMENT = (scriptEl && scriptEl.getAttribute("data-dept")) || "";
  if (!API_BASE) API_BASE = window.location.origin;

  var REQUEST_TIMEOUT_MS = 20000;
  var MAX_HISTORY_TURNS  = 6;
  var MAX_QUESTION_LEN   = 500;

  // =========== STATE ===========
  var config    = null;
  var isOpen    = false;
  var isSending = false;
  var history   = [];
  var shadow    = null;
  var els       = {};
  // =========== STATE ===========


  // =========== HELPERS ===========
  function getSessionId() {
    try {
      var sid = sessionStorage.getItem("askgla_session_id");
      if (!sid) {
        sid = "askgla-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
        sessionStorage.setItem("askgla_session_id", sid);
      }
      return sid;
    } catch (e) {
      if (!window.__askglaMemSid) window.__askglaMemSid = "askgla-mem-" + Math.random().toString(36).slice(2, 12);
      return window.__askglaMemSid;
    }
  }

  function getDeviceType() {
    return /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) ? "mobile" : "desktop";
  }

  function esc(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function getTime() {
    var d = new Date(), h = d.getHours(), m = d.getMinutes();
    var ampm = h >= 12 ? "PM" : "AM";
    h = h % 12 || 12;
    return h + ":" + (m < 10 ? "0" + m : m) + " " + ampm;
  }

  // ROLE: Convert the bot's markdown-ish answer into safe HTML, pulling the [SUGGESTIONS: ...] block out separately
  function parseAnswer(raw) {
    raw = raw || "";

    var suggestionMatch = raw.match(/\[SUGGESTIONS:\s*([^\]]+)\]/i);
    var rawSuggestions = suggestionMatch
      ? suggestionMatch[1].split("|").map(function (s) { return s.trim(); }).filter(Boolean)
      : [];

    var suggestions = [];
    var seen = {};
    rawSuggestions.forEach(function (s) {
      var key = s.toLowerCase();
      if (!seen[key]) {
        seen[key] = true;
        suggestions.push(s);
      }
    });

    var body = raw.replace(/\[SUGGESTIONS:[^\]]*\]/gi, "").trim();

    function inlineFormat(text) {
      return text
        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
        .replace(/__(.+?)__/g, "<strong>$1</strong>")
        .replace(/\*([^*]+)\*/g, "<em>$1</em>")
        .replace(/_([^_]+)_/g, "<em>$1</em>")
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
        .replace(/(https?:\/\/[^\s<"]+)/g, function (url) {
          return body.indexOf("](" + url + ")") !== -1
            ? url
            : '<a href="' + url + '" target="_blank" rel="noopener noreferrer">' + url + "</a>";
        });
    }

    var lines = body.split(/\n/);
    var htmlLines = [];
    var inList = false;

    lines.forEach(function (rawLine) {
      var line = rawLine.trim();
      if (!line) {
        if (inList) { htmlLines.push("</ul>"); inList = false; }
        return;
      }

      if (/^#{1,3}\s/.test(line)) {
        if (inList) { htmlLines.push("</ul>"); inList = false; }
        var level = line.match(/^(#+)/)[1].length;
        var tag = level <= 2 ? "h3" : "h4";
        htmlLines.push("<" + tag + ">" + inlineFormat(line.replace(/^#+\s*/, "")) + "</" + tag + ">");
        return;
      }

      if (/^[-*]\s/.test(line)) {
        if (!inList) { htmlLines.push("<ul>"); inList = true; }
        htmlLines.push("<li>" + inlineFormat(line.replace(/^[-*]\s*/, "")) + "</li>");
        return;
      }

      if (inList) { htmlLines.push("</ul>"); inList = false; }
      htmlLines.push("<p>" + inlineFormat(line) + "</p>");
    });

    if (inList) htmlLines.push("</ul>");

    return { bodyHtml: htmlLines.join(""), suggestions: suggestions };
  }
  // =========== HELPERS ===========


  // =========== STYLES ===========
  function buildStyles() {
    var TOP      = "#0F3D2E";
    var FOOT     = "#1A5C42";
    var BOT_BG   = "#D1FAE5";
    var USER_BG  = "#FEF3C7";
    var SEND_CLR = "#F59E0B";
    var CHAT_BG  = "#F5F5F5";
    var INPUT_BG = "#FFFFFF";

    return [
      ":host { all: initial; }",
      "*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }",
      ".askgla-root { font-family: 'Segoe UI', system-ui, -apple-system, Roboto, Helvetica, Arial, sans-serif; }",

      // FAB
      ".fab { position: fixed; bottom: 24px; z-index: 2147483000; width: 62px; height: 62px;",
      "  border-radius: 50%; border: none; cursor: pointer; background: " + TOP + ";",
      "  color: #fff; box-shadow: 0 6px 22px rgba(15,61,46,0.5);",
      "  display: flex; align-items: center; justify-content: center;",
      "  transition: transform .2s ease, box-shadow .2s ease; }",
      ".fab::before { content: ''; position: absolute; inset: 0; border-radius: 50%;",
      "  background: " + TOP + "; animation: askgla-pulse 2.6s ease-out infinite; opacity: 0; }",
      ".fab:hover { transform: scale(1.08); box-shadow: 0 10px 30px rgba(15,61,46,0.6); }",
      ".fab svg { width: 28px; height: 28px; position: relative; }",
      ".fab.pos-right { right: 24px; } .fab.pos-left { left: 24px; } .fab.hidden { display: none; }",

      // Panel — auto-height so it hugs its content instead of leaving dead space, capped so it never grows unbounded
      ".panel { position: fixed; bottom: 102px; z-index: 2147483000; width: 360px; height: auto;",
      "  min-height: 320px; max-height: min(520px, calc(100vh - 122px)); border-radius: 16px; overflow: hidden;",
      "  box-shadow: 0 20px 60px rgba(0,0,0,0.22), 0 6px 20px rgba(0,0,0,0.1);",
      "  display: flex; flex-direction: column;",
      "  opacity: 0; transform: translateY(20px) scale(0.97); pointer-events: none;",
      "  transition: opacity .25s ease, transform .28s cubic-bezier(0.34,1.56,0.64,1); }",
      ".panel.pos-right { right: 24px; } .panel.pos-left { left: 24px; }",
      ".panel.open { opacity: 1; transform: translateY(0) scale(1); pointer-events: auto; }",

      // Header
      ".hdr { background: " + TOP + "; color: #fff; padding: 12px 14px;",
      "  display: flex; align-items: center; gap: 10px; flex-shrink: 0; }",
      ".hdr .logo-ico { width: 36px; height: 36px; border-radius: 9px; flex-shrink: 0;",
      "  background: rgba(255,255,255,0.1); border: 1.5px solid rgba(255,255,255,0.18);",
      "  display: flex; align-items: center; justify-content: center; }",
      ".hdr .logo-ico svg { width: 20px; height: 20px; fill: #F59E0B; }",
      ".hdr .meta { flex: 1; min-width: 0; }",
      ".hdr .name { font-weight: 700; font-size: 15px; line-height: 1.2; }",
      ".hdr .status { font-size: 11px; color: #4ade80;",
      "  display: flex; align-items: center; gap: 4px; margin-top: 2px; }",
      ".hdr .dot { width: 6px; height: 6px; border-radius: 50%; background: #4ade80;",
      "  animation: askgla-blink 2s ease-in-out infinite; }",
      ".hdr .hdr-btns { display: flex; gap: 2px; }",
      ".hdr .hdr-btn { background: none; border: none; color: #fff; cursor: pointer;",
      "  width: 28px; height: 28px; border-radius: 6px; display: flex; align-items: center;",
      "  justify-content: center; font-size: 18px; opacity: 0.75; transition: opacity .15s, background .15s; }",
      ".hdr .hdr-btn:hover { opacity: 1; background: rgba(255,255,255,0.14); }",

      // Messages area — flex-basis auto so it sizes to actual content, flex-grow still fills leftover space when min-height forces the panel taller
      ".msgs { flex: 1 1 auto; min-height: 0; overflow-y: auto; padding: 14px 12px;",
      "  background: " + CHAT_BG + "; display: flex; flex-direction: column; gap: 12px; }",
      ".msgs::-webkit-scrollbar { width: 5px; }",
      ".msgs::-webkit-scrollbar-track { background: transparent; }",
      ".msgs::-webkit-scrollbar-thumb { background: #d1d5db; border-radius: 10px; }",

      // System message
      ".sys-msg { text-align: center; font-size: 10px; font-weight: 700; letter-spacing: 1px;",
      "  color: #9ca3af; text-transform: uppercase; padding: 2px 0; }",

      // Rows — column direction so timestamp sits below bubble
      ".row { display: flex; flex-direction: column; animation: askgla-in .22s ease; }",
      ".row.user { align-items: flex-end; }",
      ".row.bot  { align-items: flex-start; }",

      // Bubbles
      ".bubble { max-width: 85%; padding: 11px 14px; border-radius: 14px;",
      "  font-size: 14px; line-height: 1.55; white-space: pre-wrap; word-wrap: break-word; }",
      ".row.user .bubble { background: " + USER_BG + "; color: #1a1a1a; border-top-right-radius: 4px; }",
      ".row.bot  .bubble { background: " + BOT_BG  + "; color: #1a1a1a; border-top-left-radius: 4px; }",

      // Parsed markdown body inside a bot bubble — normal wrapping since real <p>/<ul> tags now handle line breaks
      ".md-body { white-space: normal; }",
      ".md-body p { margin: 0 0 8px; }",
      ".md-body p:last-child { margin-bottom: 0; }",
      ".md-body ul { margin: 4px 0 8px 18px; }",
      ".md-body li { margin: 2px 0; }",
      ".md-body h3, .md-body h4 { font-size: 14px; font-weight: 700; margin: 6px 0 4px; }",
      ".md-body strong { font-weight: 700; }",
      ".md-body a { color: " + TOP + "; text-decoration: underline; }",

      // Timestamp
      ".ts { font-size: 10px; color: #9ca3af; margin-top: 4px; padding: 0 4px; }",

      // Verified badge
      ".badge { display: inline-flex; align-items: center; gap: 4px; margin-top: 7px;",
      "  font-size: 11px; font-weight: 600; color: #065f46; background: #a7f3d0;",
      "  padding: 3px 8px; border-radius: 20px; }",

      // Sources
      ".sources { margin-top: 8px; font-size: 12px; }",
      ".sources summary { cursor: pointer; color: " + TOP + "; font-weight: 600; outline: none; user-select: none;",
      "  list-style: none; display: inline-flex; align-items: center; gap: 5px; }",
      ".sources summary::-webkit-details-marker { display: none; }",
      ".sources summary::before { content: '\\25B8'; font-size: 9px; transition: transform .15s ease; }",
      ".sources details[open] summary::before { transform: rotate(90deg); }",
      ".sources ul { margin: 6px 0 0; padding-left: 16px; color: #555; }",
      ".sources li { margin: 3px 0; }",
      ".sources a { color: " + TOP + "; text-decoration: none; }",
      ".sources a:hover { text-decoration: underline; }",

      // Popular questions
      ".pills-wrap { display: flex; flex-direction: column; gap: 8px; }",
      ".pills-label { font-size: 10px; font-weight: 700; letter-spacing: 0.9px; color: #9ca3af; text-transform: uppercase; }",
      ".pills { display: grid; grid-template-columns: 1fr 1fr; gap: 7px; }",
      ".pill { background: " + BOT_BG + "; color: #0F3D2E; border: none;",
      "  border-radius: 20px; padding: 9px 10px; cursor: pointer;",
      "  font-size: 12.5px; font-weight: 500; text-align: center; line-height: 1.3;",
      "  box-shadow: 0 4px 0 #86efac, 0 4px 8px rgba(0,0,0,0.1);",
      "  transition: transform .1s ease, box-shadow .1s ease; }",
      ".pill:hover { transform: translateY(-2px); box-shadow: 0 6px 0 #86efac, 0 6px 12px rgba(0,0,0,0.12); }",
      ".pill:active { transform: translateY(3px); box-shadow: 0 1px 0 #86efac; }",

      // Typing
      ".typing { display: inline-flex; gap: 5px; align-items: center; padding: 13px 16px; }",
      ".typing span { width: 7px; height: 7px; border-radius: 50%; background: #6b7280;",
      "  animation: askgla-bounce 1.3s infinite ease-in-out; }",
      ".typing span:nth-child(2) { animation-delay: .2s; }",
      ".typing span:nth-child(3) { animation-delay: .4s; }",

      // Error
      ".errline { font-size: 13px; color: #c0392b; display: flex; align-items: center; gap: 8px; }",
      ".retry { background: none; border: 1.5px solid #c0392b; color: #c0392b;",
      "  border-radius: 8px; padding: 3px 10px; font-size: 12px; cursor: pointer; transition: all .15s; }",
      ".retry:hover { background: #c0392b; color: #fff; }",

      // Input bar — dark green
      ".input-bar { display: flex; align-items: center; gap: 9px; padding: 10px 12px;",
      "  background: " + FOOT + "; flex-shrink: 0; }",
      ".input-bar textarea { flex: 1; resize: none; border: none; border-radius: 22px;",
      "  padding: 10px 16px; font-size: 14px; font-family: inherit; max-height: 80px;",
      "  outline: none; line-height: 1.4; background: " + INPUT_BG + "; color: #1a1a1a; }",
      ".input-bar textarea::placeholder { color: #9ca3af; }",
      ".send { height: 40px; padding: 0 18px; border-radius: 22px; border: none; cursor: pointer;",
      "  background: " + SEND_CLR + "; color: #fff; font-weight: 700; font-size: 14px;",
      "  white-space: nowrap; flex-shrink: 0; letter-spacing: 0.2px;",
      "  box-shadow: 0 5px 0 #b45309, 0 5px 10px rgba(0,0,0,0.2);",
      "  transition: transform .1s ease, box-shadow .1s ease; }",
      ".send:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 7px 0 #b45309, 0 7px 14px rgba(0,0,0,0.2); }",
      ".send:active:not(:disabled) { transform: translateY(4px); box-shadow: 0 1px 0 #b45309; }",
      ".send:disabled { opacity: 0.5; cursor: not-allowed; }",

      // Keyframes
      "@keyframes askgla-pulse { 0% { transform: scale(1); opacity: 0.55; } 100% { transform: scale(1.85); opacity: 0; } }",
      "@keyframes askgla-blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }",
      "@keyframes askgla-bounce { 0%, 60%, 100% { transform: translateY(0); opacity: .45; } 30% { transform: translateY(-5px); opacity: 1; } }",
      "@keyframes askgla-in { from { opacity: 0; transform: translateY(7px); } to { opacity: 1; transform: translateY(0); } }",

      // Mobile — bottom sheet, also auto-height + capped so it hugs content instead of a fixed 85vh block
      "@media (max-width: 768px) {",
      "  .panel { width: 100%; height: auto; min-height: 320px; max-height: 85vh;",
      "    bottom: 0; right: 0 !important; left: 0 !important; border-radius: 20px 20px 0 0; }",
      "  .fab { bottom: 20px; } .fab.pos-right { right: 20px; } .fab.pos-left { left: 20px; }",
      "}"
    ].join("\n");
  }
  // =========== STYLES ===========


  // =========== ICONS ===========
  var ICON_CHAT   = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>';
  var ICON_SHIELD = '<svg viewBox="0 0 24 24"><path d="M12 2L4 6v6c0 5.5 3.8 10.7 8 12 4.2-1.3 8-6.5 8-12V6z"/></svg>';
  // =========== ICONS ===========


  // =========== BUILD DOM ===========
  function buildWidget() {
    var pos     = config.position === "bottom-left" ? "left" : "right";
    var botName = esc(config.bot_name || "AskGLA");

    var host = document.createElement("div");
    host.id  = "askgla-widget-host";
    shadow   = host.attachShadow({ mode: "open" });

    var style = document.createElement("style");
    style.textContent = buildStyles();
    shadow.appendChild(style);

    var root = document.createElement("div");
    root.className = "askgla-root";
    root.innerHTML =
      '<button class="fab pos-' + pos + '" aria-label="Open ' + botName + ' chat">' + ICON_CHAT + '</button>' +
      '<div class="panel pos-' + pos + '" role="dialog" aria-label="' + botName + ' chat window">' +
        '<div class="hdr">' +
          '<div class="logo-ico">' + ICON_SHIELD + '</div>' +
          '<div class="meta">' +
            '<div class="name">' + botName + '</div>' +
            '<div class="status"><span class="dot"></span> Online</div>' +
          '</div>' +
          '<div class="hdr-btns">' +
            '<button class="hdr-btn min-btn" aria-label="Minimize">&#8722;</button>' +
            '<button class="hdr-btn close-btn" aria-label="Close">&times;</button>' +
          '</div>' +
        '</div>' +
        '<div class="msgs"></div>' +
        '<div class="input-bar">' +
          '<textarea rows="1" maxlength="' + MAX_QUESTION_LEN + '" placeholder="' + botName + ' at your service..." aria-label="Message"></textarea>' +
          '<button class="send" aria-label="Send message">Ask Me</button>' +
        '</div>' +
      '</div>';
    shadow.appendChild(root);
    document.body.appendChild(host);

    els.fab      = shadow.querySelector(".fab");
    els.panel    = shadow.querySelector(".panel");
    els.msgs     = shadow.querySelector(".msgs");
    els.textarea = shadow.querySelector("textarea");
    els.send     = shadow.querySelector(".send");
    els.minBtn   = shadow.querySelector(".min-btn");
    els.closeBtn = shadow.querySelector(".close-btn");

    wireEvents();
    renderWelcome();
  }
  // =========== BUILD DOM ===========


  // =========== EVENTS ===========
  function wireEvents() {
    els.fab.addEventListener("click", togglePanel);
    els.minBtn.addEventListener("click", togglePanel);
    els.closeBtn.addEventListener("click", togglePanel);
    els.send.addEventListener("click", onSend);

    els.textarea.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSend(); }
    });

    els.textarea.addEventListener("input", function () {
      els.textarea.style.height = "auto";
      els.textarea.style.height = Math.min(els.textarea.scrollHeight, 80) + "px";
    });
  }

  function togglePanel() {
    isOpen = !isOpen;
    els.panel.classList.toggle("open", isOpen);
    els.fab.classList.toggle("hidden", isOpen);
    if (isOpen) setTimeout(function () { els.textarea.focus(); }, 240);
  }
  // =========== EVENTS ===========


  // =========== RENDER ===========
  function scrollDown() { els.msgs.scrollTop = els.msgs.scrollHeight; }

  function renderWelcome() {
    var sys = document.createElement("div");
    sys.className = "sys-msg";
    sys.textContent = "University Assistant Connected";
    els.msgs.appendChild(sys);

    var row = document.createElement("div");
    row.className = "row bot";
    row.innerHTML =
      '<div class="bubble">' + esc(config.welcome_message) + '</div>' +
      '<div class="ts">' + getTime() + '</div>';
    els.msgs.appendChild(row);

    var starters = (config.starter_questions || []).filter(Boolean).slice(0, 4);
    if (starters.length) {
      addSuggestionPills(starters, "Popular Questions");
    }
    scrollDown();
  }

  // ROLE: Render a row of clickable pill buttons — shared by starter questions and post-answer follow-ups
  function addSuggestionPills(items, label) {
    var wrap = document.createElement("div");
    wrap.className = "pills-wrap";

    var lbl = document.createElement("div");
    lbl.className = "pills-label";
    lbl.textContent = label;
    wrap.appendChild(lbl);

    var grid = document.createElement("div");
    grid.className = "pills";
    items.forEach(function (q) {
      var b = document.createElement("button");
      b.className = "pill";
      b.textContent = q;
      b.addEventListener("click", function () {
        if (isSending) return;
        wrap.remove();
        sendQuestion(q);
      });
      grid.appendChild(b);
    });
    wrap.appendChild(grid);
    els.msgs.appendChild(wrap);
    return wrap;
  }

  function removePills() {
    var all = els.msgs.querySelectorAll(".pills-wrap");
    for (var i = 0; i < all.length; i++) all[i].remove();
  }

  function addUserBubble(text) {
    var row = document.createElement("div");
    row.className = "row user";
    row.innerHTML =
      '<div class="bubble">' + esc(text) + '</div>' +
      '<div class="ts">' + getTime() + '</div>';
    els.msgs.appendChild(row);
    scrollDown();
  }

  function addBotBubble(data) {
    var row = document.createElement("div");
    row.className = "row bot";

    var parsed = parseAnswer(data.answer || "");
    var inner = '<div class="bubble"><div class="md-body">' + parsed.bodyHtml + '</div>';

    if (data.route === "correction") {
      inner += '<div class="badge">&#10003; Verified answer</div>';
    }

    var sources = (data.sources || []).filter(function (s) {
      return s && s.title && s.category !== "cache" && s.category !== "correction";
    });
    if (sources.length) {
      inner += '<div class="sources"><details><summary>' + sources.length +
        (sources.length === 1 ? " source" : " sources") + '</summary><ul>';
      sources.forEach(function (s) {
        inner += s.url
          ? '<li><a href="' + esc(s.url) + '" target="_blank" rel="noopener noreferrer">' + esc(s.title) + '</a></li>'
          : '<li>' + esc(s.title) + '</li>';
      });
      inner += '</ul></details></div>';
    }
    inner += '</div><div class="ts">' + getTime() + '</div>';
    row.innerHTML = inner;
    els.msgs.appendChild(row);

    if (parsed.suggestions.length) {
      addSuggestionPills(parsed.suggestions, "Quick follow-ups");
    }

    scrollDown();
  }

  function showTyping() {
    var row = document.createElement("div");
    row.className = "row bot";
    row.innerHTML = '<div class="bubble typing"><span></span><span></span><span></span></div>';
    els.msgs.appendChild(row);
    scrollDown();
    return row;
  }

  function addError(message, retryText) {
    var row = document.createElement("div");
    row.className = "row bot";
    var html = '<div class="bubble"><div class="errline">' + esc(message);
    if (retryText) html += ' <button class="retry">Retry</button>';
    html += '</div></div><div class="ts">' + getTime() + '</div>';
    row.innerHTML = html;
    els.msgs.appendChild(row);
    if (retryText) {
      row.querySelector(".retry").addEventListener("click", function () {
        row.remove();
        sendQuestion(retryText);
      });
    }
    scrollDown();
  }
  // =========== RENDER ===========


  // =========== SEND ===========
  function onSend() {
    var text = (els.textarea.value || "").trim();
    if (!text || isSending) return;
    removePills();
    els.textarea.value = "";
    els.textarea.style.height = "auto";
    sendQuestion(text);
  }

  function sendQuestion(text) {
    if (isSending) return;
    text = text.slice(0, MAX_QUESTION_LEN);

    isSending = true;
    els.send.disabled = true;
    addUserBubble(text);

    var typingRow  = showTyping();
    var controller = new AbortController();
    var timedOut   = false;
    var timer = setTimeout(function () { timedOut = true; controller.abort(); }, REQUEST_TIMEOUT_MS);

    fetch(API_BASE + "/api/chat", {
      method: "POST",
      headers: {
        "Content-Type":      "application/json",
        "X-Session-ID":      getSessionId(),
        "X-Department-Slug": DEPARTMENT,
        "X-Device-Type":     getDeviceType(),
        "X-Referrer-Page":   (location.pathname || "").slice(0, 200),
      },
      body: JSON.stringify({
        question: text,
        conversation_history: history.slice(-MAX_HISTORY_TURNS),
      }),
      signal: controller.signal,
    })
      .then(function (res) {
        clearTimeout(timer);
        if (res.status === 429) { var e  = new Error("rate_limited"); e.code  = 429;          throw e;  }
        if (!res.ok)            { var e2 = new Error("http_" + res.status); e2.code = res.status; throw e2; }
        return res.json();
      })
      .then(function (data) {
        typingRow.remove();
        addBotBubble(data);
        history.push({ role: "user",      content: text });
        history.push({ role: "assistant", content: (data.answer || "").slice(0, 800) });
        if (history.length > MAX_HISTORY_TURNS) history = history.slice(-MAX_HISTORY_TURNS);
      })
      .catch(function (err) {
        typingRow.remove();
        if (err && err.code === 429) addError("You're sending messages too fast. Please wait.", null);
        else if (timedOut)           addError("This is taking too long.", text);
        else                         addError("Connection error. Please check your network.", text);
      })
      .then(function () {
        clearTimeout(timer);
        isSending = false;
        els.send.disabled = false;
        if (isOpen) els.textarea.focus();
      });
  }
  // =========== SEND ===========


  // =========== BOOT ===========
  function fetchConfigThenBuild() {
    var url = API_BASE + "/api/widget-config";
    if (DEPARTMENT) url += "?department_slug=" + encodeURIComponent(DEPARTMENT);

    fetch(url)
      .then(function (res) { return res.ok ? res.json() : Promise.reject(); })
      .then(function (cfg) { config = cfg || {}; })
      .catch(function () {
        config = {
          bot_name: "AskGLA",
          welcome_message: "Hi! Welcome to GLA University. I'm your virtual assistant, here to help with admissions, campus life, and more.",
          starter_questions: [],
          theme_color: "#0F3D2E",
          accent_color: "#F59E0B",
          position: "bottom-right",
          is_active: true,
        };
      })
      .then(function () {
        if (config.is_active === false) return;
        buildWidget();
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", fetchConfigThenBuild);
  } else {
    fetchConfigThenBuild();
  }
  // =========== BOOT ===========
})();
