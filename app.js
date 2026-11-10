/* Out & About by Putri: Bean There (cafés), Seconds, Please (restaurants), Pour Decisions (bars & clubs)
   and Sip & Bite (all of them together). A static site: data comes from the published Google Sheet tabs,
   votes and notes go through the same Apps Script as Bean There. */
(function () {
  "use strict";

  var CFG = window.OUT_AND_ABOUT_CONFIG || {};
  var API = (CFG.apiUrl || "").trim();
  var BEAN_THERE = (CFG.beanThereUrl || "https://amabelnapitu.github.io/bean-there-by-putri/").replace(/\/?$/, "/");
  var app = document.getElementById("app"), navEl = document.getElementById("nav"), topbar = document.getElementById("topbar"), toastEl = document.getElementById("toast");

  // ---------- Storage (all on this phone; no login) ----------
  function load(key, fallback) { try { var v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); } catch (e) { return fallback; } }
  function save(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {} }
  var device = load("oa-device", null);
  if (!device) { device = "d" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36); save("oa-device", device); }

  // ---------- Helpers ----------
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (ch) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]; }); }
  function slug(s) { return String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9぀-鿿]+/g, "-").replace(/^-|-$/g, ""); }
  function firstNum(s) { var m = /(\d+)/.exec(String(s || "")); return m ? +m[1] : null; }
  function price(x) { return x.p ? (/^\d/.test(x.p) ? "HK$" + x.p : String(x.p).replace(/^~(\d)/, "~HK$$$1")) : ""; }
  function byRank(a, b) { return (a.rk || 9) - (b.rk || 9) || (b.rt || 0) - (a.rt || 0); }
  function plural(n, w) { return n + " " + w + (n === 1 ? "" : "s"); }
  function toast(msg) { toastEl.textContent = msg; toastEl.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(function () { toastEl.hidden = true; }, 2200); }
  var timers = [];
  function clearTimers() { timers.forEach(clearTimeout); timers = []; }
  var reduceMotion = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---------- CSV ----------
  function parseCSV(text) {
    var rows = [], row = [], f = "", q = false;
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
      else if (c === '"') q = true;
      else if (c === ",") { row.push(f); f = ""; }
      else if (c === "\n") { row.push(f); rows.push(row); row = []; f = ""; }
      else if (c !== "\r") f += c;
    }
    if (f || row.length) { row.push(f); rows.push(row); }
    if (!rows.length) return [];
    var head = rows[0].map(function (h) { return h.toLowerCase().replace(/[^a-z]/g, ""); });
    return rows.slice(1).map(function (r) { var o = {}; head.forEach(function (h, i) { if (h) o[h] = (r[i] || "").trim(); }); return o; })
      .filter(function (o) { return o.name; });
  }
  function fetchText(url) {
    var ctrl = window.AbortController ? new AbortController() : null;
    var t = setTimeout(function () { if (ctrl) ctrl.abort(); }, 8000);
    return fetch(url, ctrl ? { signal: ctrl.signal, cache: "no-cache" } : {}).then(function (r) { clearTimeout(t); if (!r.ok) throw new Error(r.status); return r.text(); });
  }
  // The published sheet tab first; the saved copy in /data if that fails.
  function loadTab(url, local) {
    url = (url || "").trim();
    var first = url ? fetchText(url) : fetchText(local);
    return first.then(function (t) { var rows = parseCSV(t); if (!rows.length) throw new Error("empty"); return rows; })
      .catch(function () { return url && local ? fetchText(local).then(parseCSV) : []; })
      .catch(function () { return []; });
  }
  function tagsOf(s) { return String(s || "").split(/[;,]/).map(function (x) { return x.trim().toLowerCase(); }).filter(String); }
  function num(s) { var n = parseFloat(s); return isNaN(n) ? null : n; }
  function coords(s) { var m = /(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/.exec(s || ""); return m ? [+m[1], +m[2]] : null; }
  function isOpen(x) { return x.tags.indexOf("closed") === -1 && x.tags.indexOf("temp-closed") === -1; }

  // ---------- Data ----------
  var CAFES = [], FOOD = [], BARS = [], RATED_BARS = [], DESSERTS = [], ALL = [], BYKEY = {}, BR = {};
  var SWEET_RE = /cake|waffle|croissant|mochi|pancake|cookie|dessert|parfait|kakigori|pastr|muffin|tiramisu|gelato|ice cream/i;
  var BRUNCH_RE = /egg|toast|bagel|pancake|sando|croissant|benedict|waffle|muffin|taco rice|sandwich|brunch/i;

  function parseDate(v) { if (!v) return null; var d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(v) ? v + "T00:00" : v); return isNaN(d) ? null : d; }
  function isNew(x) { return x.added && Date.now() - x.added.getTime() < 31 * 864e5 && x.added.getTime() <= Date.now() + 864e5; }
  function base(o, type) {
    return { type: type, d: o.district, n: o.name, rk: num(o.rank), rt: num(o.rating), o: o.mustorder || "", p: o.price || "", pp: firstNum(o.price),
      no: o.note || "", tags: tagsOf(o.tags), maps: o.mapslink || "", ll: coords(o.latlng), added: parseDate(o.added),
      bnote: o.bookingnote || o.bookingtip || "", perk: o.perk || o.perks || "" };
  }
  function keyOf(x) { return x.type + "/" + slug(x.d) + "/" + slug(x.n); }
  // Branches from the BRANCHES tab (filled in by the monthly check): every open branch of each place, by kind + name.
  function branchLabel(o, ll) {
    var m = /\(([^)]+)\)\s*$/.exec(o.branch || "");
    if (m && !/^\d/.test(m[1])) return m[1];
    var parts = String(o.address || "").split(/,\s*/), i = parts.findIndex(function (s) { return /^(Hong Kong Island|Kowloon|New Territories)$/i.test(s.trim()); });
    if (i > 0 && /^[A-Za-z][A-Za-z .'-]+$/.test(parts[i - 1].trim())) return parts[i - 1].trim();
    var best = "", bk = 9;
    Object.keys(CENTRE).forEach(function (d) { var k = kmPts(ll, CENTRE[d]); if (k < bk) { bk = k; best = d; } });
    return bk < 1.5 ? best : "Another area";
  }
  function buildBranches(rows) {
    BR = {}; var seen = {};
    rows.forEach(function (o) {
      var ll = coords(o.latlng), kind = (o.kind || "").toLowerCase();
      if (!ll || !o.placeid || seen[kind + o.placeid] || /^(y|yes|x|true|✓)$/i.test((o.hide || "").trim()) || (o.status || "open").toLowerCase() !== "open") return;
      seen[kind + o.placeid] = 1;
      (BR[kind + "|" + slug(o.name)] = BR[kind + "|" + slug(o.name)] || []).push({ id: o.placeid, n: o.branch || o.name, addr: o.address || "", ll: ll, label: branchLabel(o, ll) });
    });
  }
  function buildData(c, f, b, s, br) {
    CAFES = c.map(function (o) { var x = base(o, "cafe"); x.k = o.drink || ""; x.taste = tagsOf(o.taste); return x; }).filter(isOpen);
    FOOD = f.map(function (o) { var x = base(o, "food"); x.c = o.cuisine || ""; x.dessert = o.dessert || ""; return x; }).filter(isOpen);
    BARS = b.map(function (o) { var x = base(o, "bar"); x.kind = /both/i.test(o.type) ? "Both" : /club/i.test(o.type) ? "Club" : "Bar"; x.c = x.kind === "Both" ? "Bar → club" : x.kind; x.area = o.area || ""; return x; }).filter(isOpen);
    RATED_BARS = BARS.filter(function (x) { return x.rt != null; });
    DESSERTS = s.map(function (o) { var x = base(o, "dessert"); x.c = "Dessert"; return x; }).filter(isOpen);
    CAFES.forEach(function (x) { x.brunch = BRUNCH_RE.test(x.o + " " + x.no); x.sweet = SWEET_RE.test(x.o + " " + x.no); });
    FOOD.forEach(function (x) { x.brunch = x.c === "Healthy"; x.sweet = x.c === "Dessert"; });
    ALL = FOOD.concat(CAFES, RATED_BARS, DESSERTS);
    BYKEY = {};
    FOOD.concat(CAFES, BARS, DESSERTS).forEach(function (x) { x.key = keyOf(x); BYKEY[x.key] = x; });
    computeGeo();
    buildBranches(br || []);
  }
  function find(key) { return BYKEY[key]; }
  // Other branches of x: every open branch except the one Putri visited (anything within ~150 m of x itself).
  function branchesOf(x) {
    var own = where(x);
    return (BR[x.type + "|" + slug(x.n)] || []).filter(function (b) { return kmPts(own, b.ll) > 0.15; });
  }
  // The spot of x (Putri's branch or another one) closest to a point.
  function nearestSpot(x, pt) {
    var best = { ll: where(x), branch: null, k: pt ? kmPts(pt, where(x)) : 0 };
    if (!pt) return best;
    branchesOf(x).forEach(function (b) { var k = kmPts(pt, b.ll); if (k < best.k) best = { ll: b.ll, branch: b, k: k }; });
    return best;
  }
  function distTo(x, pt) { return nearestSpot(x, pt).k; }
  function branchUrl(b) { return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(b.n + ", " + b.addr) + "&query_place_id=" + encodeURIComponent(b.id); }
  function spotNote(x, spot) {
    if (!spot || !spot.branch) return "";
    var same = spot.branch.label === x.d;
    return (same ? "Another " : "") + spot.branch.label + " branch" + (x.rt != null ? " · ★ " + x.rt : "") + (same ? " (Putri visited a different one)" : " (Putri visited the " + x.d + " one)");
  }

  // ---------- Geography ----------
  var ISLAND = ["Kennedy Town", "HKU", "Sai Ying Pun", "Sheung Wan", "Central", "Admiralty", "Wan Chai", "Causeway Bay", "Tin Hau", "Fortress Hill", "North Point", "Quarry Bay", "Taikoo", "Sai Wan Ho", "Shau Kei Wan", "Chai Wan"];
  var TW = ["Tsim Sha Tsui", "Jordan", "Yau Ma Tei", "Mong Kok", "Prince Edward", "Sham Shui Po"];
  var EAST = ["Exhibition Centre", "Hung Hom", "Mong Kok East", "Kowloon Tong", "Tai Wai", "Sha Tin", "Fo Tan", "University", "Tai Po Market"];
  var EAST_Y = { "Exhibition Centre": 208, "Hung Hom": 112, "Mong Kok East": 92, "Kowloon Tong": 74, "Tai Wai": 54, "Sha Tin": 34, "Fo Tan": 22, "University": 14, "Tai Po Market": 8 };
  var LINE = ISLAND.concat(TW, EAST);
  var CENTRE = {}, DEFAULT_CENTRE = { "Sha Tin": [22.3830, 114.1880], "Repulse Bay": [22.2367, 114.1965] };
  function computeGeo() {
    var acc = {};
    ALL.forEach(function (x) { if (!x.ll) return; var a = acc[x.d] = acc[x.d] || [0, 0, 0]; a[0] += x.ll[0]; a[1] += x.ll[1]; a[2]++; });
    CENTRE = {};
    Object.keys(DEFAULT_CENTRE).forEach(function (d) { CENTRE[d] = DEFAULT_CENTRE[d]; });
    Object.keys(acc).forEach(function (d) { var a = acc[d]; CENTRE[d] = [a[0] / a[2], a[1] / a[2]]; });
  }
  function where(x) { return x.ll || CENTRE[x.d] || [22.30, 114.17]; }
  function kmPts(p, q) { var dx = (q[1] - p[1]) * Math.cos((p[0] + q[0]) * Math.PI / 360), dy = q[0] - p[0]; return Math.sqrt(dx * dx + dy * dy) * 111.2; }
  function km(a, b) { return kmPts(where(a), where(b)); }
  function walk(k) { return k < 0.15 ? "next door" : k < 1 ? "~" + Math.round(k * 1000 / 50) * 50 + " m" : "~" + k.toFixed(1) + " km"; }
  function neighbours(d) {
    var out = [d], line = ISLAND.indexOf(d) !== -1 ? ISLAND : TW.indexOf(d) !== -1 ? TW : EAST.indexOf(d) !== -1 ? EAST : null;
    if (!line) return out;
    var present = line.filter(function (x) { return x === d || ALL.some(function (p) { return p.d === x; }); }), j = present.indexOf(d);
    if (j > 0) out.push(present[j - 1]); if (j < present.length - 1) out.push(present[j + 1]);
    return out;
  }
  function districtsOf(list) {
    var seen = {}, out = [];
    LINE.forEach(function (d) { if (list.some(function (x) { return x.d === d; })) { seen[d] = 1; out.push(d); } });
    list.forEach(function (x) { if (!seen[x.d]) { seen[x.d] = 1; out.push(x.d); } });
    return out;
  }
  function q(x) { return x.n + ", " + x.d + ", Hong Kong"; }
  function mapsUrl(x) { return /^https?:\/\//i.test(x.maps) ? x.maps : "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(q(x)); }
  function routeUrl(list) {
    if (list.length < 2) return list.length ? mapsUrl(list[0]) : "";
    return "https://www.google.com/maps/dir/?api=1&travelmode=walking&origin=" + encodeURIComponent(q(list[0])) + "&destination=" + encodeURIComponent(q(list[list.length - 1])) +
      (list.length > 2 ? "&waypoints=" + encodeURIComponent(list.slice(1, -1).map(q).join("|")) : "");
  }
  function icon(x) { return x.type === "cafe" ? "☕" : x.type === "bar" ? (x.kind === "Club" ? "🪩" : "🍸") : x.type === "dessert" ? "🍰" : "🍽️"; }
  function href(x) { return "#p/" + x.key; }
  var TAGS = { "lunch-set": "🍱 Lunch set", value: "💸 Good value", cheap: "🪙 Cheap", pricey: "💎 Pricey", spicy: "🌶️ Spicy", buffet: "🍽️ Buffet", "big-portion": "🍛 Big portions", "small-portion": "🥄 Small portions", "veggie-friendly": "🥦 Veggie-friendly", "late-night": "🌙 Late night", group: "👯 Groups", healthy: "🥗 Healthy", "small-space": "🤏 Small space", cute: "🌸 Cute", "work-friendly": "💻 Work-friendly", cozy: "🛋️ Cosy", "takeaway-only": "🥡 Takeaway only", "time-limit": "⏱️ Time limit", "no-ports": "🔌 No sockets", "cash-only": "💵 Cash only", cocktails: "🍸 Cocktails", wine: "🍷 Wine", shots: "🥃 Shots", dancing: "🪩 Dancing", pretty: "✨ Pretty", crowded: "👥 Gets crowded", "best-on-weekdays": "📅 Best on weekdays", "free-shots": "🎁 Free shots" };
  function tagChips(x) { return x.tags.length || x.perk ? '<div class="chips">' + (x.perk ? '<span class="chip perk">🎁 Perk</span>' : "") + x.tags.map(function (t) { return '<span class="chip">' + esc(TAGS[t] || t) + "</span>"; }).join("") + "</div>" : ""; }
  // Putri's own advice on getting a table, and any perk for booking a certain way (Booking Note and Perk columns).
  function tipCards(x) {
    return (x.perk ? '<div class="banner perk-card"><span aria-hidden="true" style="font-size:24px">🎁</span><span><b>Putri’s perk</b><small>' + esc(x.perk) + "</small></span></div>" : "") +
      (x.bnote ? '<div class="banner"><span aria-hidden="true" style="font-size:24px">📅</span><span><b>' + (/walk[\s-]?in/i.test(x.bnote) ? "Getting in" : "Booking tip") + "</b><small>" + esc(x.bnote) + "</small></span></div>" : "");
  }

  // Something sweet after a meal: Putri's dessert list if there is one, otherwise cafés known for cake and dessert places.
  // Desserts Putri has rated (plus dessert restaurants); before there was a dessert list, cafés known for cake filled in.
  function sweetPool() {
    var rated = DESSERTS.filter(function (x) { return x.rt != null; });
    return rated.length ? rated.concat(FOOD.filter(function (f) { return f.sweet; })) : FOOD.filter(function (f) { return f.sweet; }).concat(CAFES.filter(function (c) { return c.sweet; }));
  }
  function dessertsNear(x, n) {
    return sweetPool().filter(function (y) { return y !== x && (y.rt == null || y.rt >= 3.5); }).map(function (y) { var s = nearestSpot(y, where(x)); return { y: y, k: s.k, spot: s }; })
      .sort(function (a, b) { return a.k - b.k || (b.y.rt || 0) - (a.y.rt || 0); }).slice(0, n);
  }
  function dessertLine(r) {
    if (r.dessert) return '<p class="dessert-line">🍰 Stay for the <b>' + esc(r.dessert) + "</b></p>";
    var d = dessertsNear(r, 1)[0];
    return d ? '<p class="dessert-line">🍰 Then dessert: <a href="' + href(d.y) + '">' + esc(d.y.n) + "</a>" + (d.spot.branch ? " (" + esc(d.spot.branch.label) + ")" : "") + " · " + walk(d.k) + "</p>" : "";
  }

  // ---------- Art ----------
  function dumpling(cls) {
    return '<svg class="' + cls + '" viewBox="0 0 140 150" aria-hidden="true">' +
      '<g class="steam" opacity=".55"><path d="M44 44c-6-8 6-12 0-20" stroke="var(--straw-deep)" stroke-width="2.5" fill="none" stroke-linecap="round"/><path d="M58 36c-6-8 6-12 0-20" stroke="var(--straw-deep)" stroke-width="2.5" fill="none" stroke-linecap="round"/></g>' +
      '<ellipse cx="70" cy="131" rx="54" ry="9" fill="var(--straw)" stroke="var(--straw-deep)" stroke-width="2"/>' +
      '<g class="bob"><path class="dump-body" style="stroke-width:2.2" d="M22 106C22 78 44 58 70 58C96 58 118 78 118 106C118 122 98 129 70 129C42 129 22 122 22 106Z"/>' +
      '<path class="dump-pleat" style="stroke-width:1.8;opacity:.35" d="M70 61C60 67 51 75 47 86M70 61C66 69 62 77 61 88M70 61C74 69 78 77 79 88M70 61C80 67 89 75 93 86"/>' +
      '<path class="dump-body" style="stroke-width:2.2" d="M62 62C62 52 78 52 78 62C74 65 66 65 62 62Z"/>' +
      '<ellipse cx="46" cy="84" rx="8" ry="4.5" fill="#FFFFFF" opacity=".7" transform="rotate(-35 46 84)"/>' +
      '<circle cx="57" cy="102" r="3.5" fill="#3A281E"/><circle cx="83" cy="102" r="3.5" fill="#3A281E"/>' +
      '<path d="M64 110q6 6 12 0" stroke="#3A281E" stroke-width="2.6" fill="none" stroke-linecap="round"/>' +
      '<circle cx="46" cy="109" r="5" fill="#F4A3B0" opacity=".85"/><circle cx="94" cy="109" r="5" fill="#F4A3B0" opacity=".85"/></g>' +
      '<line class="stick" x1="126" y1="16" x2="84" y2="60"/><line class="stick" x1="136" y1="26" x2="90" y2="64"/>' +
      '<line class="stick-tip" x1="126" y1="16" x2="118" y2="24"/><line class="stick-tip" x1="136" y1="26" x2="128" y2="33"/></svg>';
  }
  function lily(cx, cy, r) {
    var p = "";
    for (var i = 0; i < 6; i++) {
      var a = i * 60 + (i % 2 ? 0 : 30);
      p += '<g transform="rotate(' + a + " " + cx + " " + cy + ')"><path class="lily-petal" d="M' + cx + " " + cy + "C" + (cx + r * .32) + " " + (cy - r * .3) + " " + (cx + r * .26) + " " + (cy - r * .82) + " " + cx + " " + (cy - r) + "C" + (cx - r * .26) + " " + (cy - r * .82) + " " + (cx - r * .32) + " " + (cy - r * .3) + " " + cx + " " + cy + 'Z"/><path class="lily-in" d="M' + cx + " " + cy + "C" + (cx + r * .1) + " " + (cy - r * .3) + " " + (cx + r * .06) + " " + (cy - r * .5) + " " + cx + " " + (cy - r * .58) + "C" + (cx - r * .06) + " " + (cy - r * .5) + " " + (cx - r * .1) + " " + (cy - r * .3) + " " + cx + " " + cy + 'Z"/></g>';
    }
    for (var j = 0; j < 5; j++) { var b = (j * 72 + 10) * Math.PI / 180; p += '<line class="lily-stamen" x1="' + cx + '" y1="' + cy + '" x2="' + (cx + Math.cos(b) * r * .5).toFixed(1) + '" y2="' + (cy + Math.sin(b) * r * .5).toFixed(1) + '"/>'; }
    return p;
  }
  function cup(cls) {
    return '<svg class="' + cls + '" viewBox="0 0 140 150" aria-hidden="true">' +
      '<path d="M70 88C68 72 72 60 70 46" stroke="var(--leaf)" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M70 74c-12-2-20-10-22-18 10 0 20 6 22 18z" fill="var(--leaf)"/>' + lily(70, 36, 24) +
      '<ellipse cx="70" cy="136" rx="52" ry="8" fill="#E9D3B4" stroke="#6B4A3A" stroke-width="2"/><path d="M100 98c14-2 18 18 2 22" stroke="#2E1F1A" stroke-width="6" fill="none" stroke-linecap="round"/>' +
      '<path d="M34 86h72l-8 40c-1 6-6 9-12 9H54c-6 0-11-3-12-9z" fill="#2E1F1A"/><ellipse cx="70" cy="87" rx="36" ry="6" fill="#6B4A3A"/>' +
      '<circle cx="60" cy="106" r="3.5" fill="#F7F2FC"/><circle cx="80" cy="106" r="3.5" fill="#F7F2FC"/><path d="M63 115q7 6 14 0" stroke="#F7F2FC" stroke-width="2.5" fill="none" stroke-linecap="round"/></svg>';
  }
  function coupe(cls) {
    return '<svg class="' + cls + '" viewBox="0 0 140 150" aria-hidden="true">' +
      '<ellipse cx="70" cy="137" rx="34" ry="6" fill="#3B2620" opacity=".12"/>' +
      '<g class="bob"><path d="M70 100V128" stroke="#3B2620" stroke-width="4" stroke-linecap="round"/><ellipse cx="70" cy="130" rx="22" ry="5" fill="#FFFDF8" stroke="#3B2620" stroke-width="2.5"/>' +
      '<path d="M24 52H116C115 84 95 102 70 102C45 102 25 84 24 52Z" fill="#FFFDF8" stroke="#3B2620" stroke-width="2.5"/>' +
      '<path d="M30 60H110C107 85 90 96 70 96C50 96 33 85 30 60Z" fill="#F4A7B9"/>' +
      '<ellipse cx="70" cy="60" rx="40" ry="5" fill="#F9CCD6"/>' +
      '<path d="M38 66C39 76 44 84 50 88" stroke="#FFFFFF" stroke-width="4" fill="none" stroke-linecap="round" opacity=".8"/>' +
      '<ellipse cx="70" cy="52" rx="46" ry="6" fill="none" stroke="#3B2620" stroke-width="2.5"/>' +
      '<circle cx="60" cy="76" r="3.6" fill="#3B2620"/><circle cx="80" cy="76" r="3.6" fill="#3B2620"/><path d="M63 85q7 6 14 0" stroke="#3B2620" stroke-width="2.6" fill="none" stroke-linecap="round"/>' +
      '<circle cx="50" cy="84" r="4.5" fill="#E07A93" opacity=".75"/><circle cx="90" cy="84" r="4.5" fill="#E07A93" opacity=".75"/>' +
      '<path d="M100 26C99 34 98 40 96 46" stroke="#1F4D3A" stroke-width="2.5" fill="none" stroke-linecap="round"/><path d="M100 26c7-5 14-3 16 2-7 3-12 2-16-2z" fill="#1F4D3A"/>' +
      '<circle cx="95" cy="48" r="9" fill="#8C2155" stroke="#3B2620" stroke-width="2"/><circle cx="92" cy="45" r="2.2" fill="#FFFFFF" opacity=".75"/></g></svg>';
  }
  var DOODLE = '<svg class="doodle" viewBox="0 0 360 720" preserveAspectRatio="none" aria-hidden="true"><path d="M24 40C90 20 150 34 200 26c30-5 40-30 22-30s-14 30 18 30c40 0 70-6 98 10M340 40c-14 90 6 170-6 250-4 30 22 40 20 20s-30-10-24 20c10 70 4 160 14 240M330 690c-80 14-150-6-210 6-30 6-36 28-18 28s16-26-14-24c-30 2-50 0-66-10M20 690c10-90-8-170 4-250 4-30-20-36-20-18s28 14 22-16C16 330 30 230 18 140c-3-30 0-70 6-100" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>';
  function floaties(list) { return list.map(function (f) { return '<span class="floaty" aria-hidden="true" style="left:' + f[0] + ";top:" + f[1] + ";animation-delay:" + f[2] + 's">' + f[3] + "</span>"; }).join(""); }

  // ---------- State ----------
  var S = {
    myday: load("oa-myday", []), mq: "",
    food: { profile: load("oa-food-profile", null), pin: "Central", query: "", budget: 450, lunch: false, spinLoc: "any", spinAngle: 0, tagline: 0 },
    bar: { profile: load("oa-bar-profile", null), pin: "Central", budget: 200, kind: "all", spinLoc: "any", spinAngle: 0, tagline: 0 },
    bean: { pin: "Sheung Wan", profile: load("oa-bean-profile", null) },
    saved: load("oa-saved", []), hq: "", recent: [], shared: null,
    day: { profile: load("oa-day-profile", null), pswaps: {}, area: "Central", plan: "weekend", swaps: {}, layer: "both", pin: "Central", tagline: 0 },
    near: { at: null, label: "", district: "Central", type: "both", locating: false },
    quiz: null, cooking: null,
    votes: {}, myVotes: load("oa-myvotes", {}), noteKind: "food"
  };
  function inDay(key) { return S.myday.indexOf(key) !== -1; }
  function saveDay() { save("oa-myday", S.myday); }
  function addBtn(x) { return '<button class="pill' + (inDay(x.key) ? "" : " solid") + '" data-add="' + esc(x.key) + '">' + (inDay(x.key) ? "✓ In My day" : "＋ My day") + "</button>"; }

  // ---------- MTR-style map ----------
  function mtr(dlist, opts) {
    var island = ISLAND.filter(function (d) { return dlist.indexOf(d) !== -1; }), tw = TW.filter(function (d) { return dlist.indexOf(d) !== -1; });
    var east = EAST.filter(function (d) { return dlist.indexOf(d) !== -1; });
    var other = dlist.filter(function (d) { return island.indexOf(d) === -1 && tw.indexOf(d) === -1 && east.indexOf(d) === -1; });
    var pos = {};
    island.forEach(function (d, i) { pos[d] = [22 + 300 * i / Math.max(1, island.length - 1), 236, "i"]; });
    var hub = pos["Admiralty"] || pos["Central"] || [172, 236];
    tw.forEach(function (d, i) { pos[d] = [hub[0], tw.length === 1 ? 98 : 98 - 62 * i / (tw.length - 1), "t"]; });
    var xe = hub[0] + 66;
    east.forEach(function (d) { pos[d] = [xe, EAST_Y[d], "e"]; });
    var bus = pos["Central"] || hub;
    other.forEach(function (d, i) { pos[d] = [Math.min(300, bus[0] + 84 + i * 78), 292 + (i % 2) * 16, "o"]; });
    var svg = '<path class="harbour" d="M-4 128C60 118 120 140 180 128S300 118 364 128L364 150C300 140 240 160 180 150S60 140 -4 152Z"/><text class="map-water" x="190" y="144">VICTORIA HARBOUR</text>';
    if (tw.length) svg += '<path class="mtr-line mtr-tw" d="M' + hub[0] + " " + pos[tw[tw.length - 1]][1] + 'V236"/>';
    if (east.length) {
      svg += '<path class="mtr-line mtr-east" d="M' + hub[0] + " 236H" + (hub[0] + 9) + "V168C" + (hub[0] + 9) + " 146 " + xe + " 150 " + xe + " 126V" + Math.min.apply(null, east.map(function (d) { return EAST_Y[d]; })) + '"/>';
      ["Hung Hom", "Kowloon Tong", "Tai Wai"].forEach(function (g) { if (east.indexOf(g) === -1) svg += '<circle class="ghost-dot" cx="' + xe + '" cy="' + EAST_Y[g] + '" r="3"/><text class="ghost" x="' + (xe + 9) + '" y="' + (EAST_Y[g] + 3) + '">' + g + "</text>"; });
      svg += '<g class="mtr-key"><path d="M14 14h12" stroke="#0075C2" stroke-width="4"/><text x="29" y="17">Island</text><path d="M62 14h12" stroke="#E2231A" stroke-width="4"/><text x="77" y="17">Tsuen Wan</text><path d="M124 14h12" stroke="#5EB6E4" stroke-width="4"/><text x="139" y="17">East Rail</text></g>';
    }
    if (island.length) svg += '<path class="mtr-line mtr-island" d="M' + pos[island[0]][0] + " 236H" + pos[island[island.length - 1]][0] + '"/>';
    other.forEach(function (d) { var p = pos[d]; svg += '<path class="mtr-bus" d="M' + bus[0] + " 236C" + (bus[0] + 4) + " " + (p[1] - 16) + " " + (bus[0] + 38) + " " + p[1] + " " + p[0] + " " + p[1] + '"/>'; });
    if (other.length) svg += '<text class="mtr-key" x="22" y="332">off these lines: bus or taxi</text>';
    dlist.forEach(function (d) {
      var p = pos[d], on = opts.pin === d, dim = opts.dim && opts.dim(d), r = 5 + Math.min(5, opts.size(d) / 2.5), label;
      if (p[2] === "i") label = '<text transform="rotate(-48 ' + (p[0] + 4) + " " + (p[1] - 14) + ')" x="' + (p[0] + 4) + '" y="' + (p[1] - 14) + '">' + esc(d === "Taikoo" ? "Tai Koo" : d) + "</text>";
      else if (p[2] === "t" && east.length) label = '<text text-anchor="end" x="' + (p[0] - 14) + '" y="' + (p[1] + 4) + '">' + esc(d) + "</text>";
      else label = '<text x="' + (p[0] + 14) + '" y="' + (p[1] + 4) + '">' + esc(d) + "</text>";
      var badges = "";
      if (opts.badges) opts.badges(d).forEach(function (b, k) {
        var bx = p[2] === "e" ? p[0] - r - 12 - k * 17 : p[0], by = p[2] === "e" ? p[1] : p[1] + r + 9 + k * 16;
        badges += '<circle class="b-' + b[0] + '" cx="' + bx + '" cy="' + by + '" r="7.5"/><text class="cnt t-' + b[0] + '" x="' + bx + '" y="' + (by + 2.8) + '" text-anchor="middle">' + b[1] + "</text>";
      });
      svg += '<g class="stn' + (on ? " on" : "") + (dim ? " dim" : "") + '" data-pin="' + esc(d) + '" tabindex="0" role="button" aria-label="' + esc(d) + '"><circle class="hit" cx="' + p[0] + '" cy="' + p[1] + '" r="14"/><circle class="dot" cx="' + p[0] + '" cy="' + p[1] + '" r="' + (on ? r + 2 : r) + '"/>' + label + badges + "</g>";
    });
    return '<div class="mapbox"><svg viewBox="0 0 360 344" role="group" aria-label="MTR-style map of districts">' + svg + '</svg><span class="scale-note">' + esc(opts.note || "bigger dot = more places") + "</span></div>";
  }
  function placeRows(list) {
    return '<ul class="list">' + list.map(function (x) {
      var un = x.rt == null, inner = '<span class="n">' + (x.rk ? x.rk : icon(x)) + "</span><span><b>" + esc(x.n) + "</b><small>" + esc(x.type !== "cafe" ? (x.c || "") + (x.o ? " · " + x.o : "") : x.o) + '</small></span><span class="score">' + (un ? "Review soon" : "★ " + x.rt) + "</span>";
      return un ? '<li class="untried"><div class="row">' + inner + "</div></li>" : '<li><a class="row" href="' + href(x) + '">' + inner + "</a></li>";
    }).join("") + "</ul>";
  }

  // ---------- Quizzes ----------
  var MOODS = { asian: ["Chinese", "Japanese", "Korean", "Thai", "Asian", "Filipino"], pizza: ["Pizza", "Italian"], spicy: ["Thai", "Indian", "Mexican"], western: ["Western", "Burgers"], fresh: ["Healthy", "Vietnamese", "Japanese"], any: [] };
  var QUIZZES = {
    food: [
      { key: "mood", q: "What are you craving?", sub: "Go with your stomach.", tiles: true, opts: [["asian", "Asian comfort", "Noodles, rice, pho", "🍜"], ["pizza", "Pizza & pasta", "Carbs on carbs", "🍕"], ["spicy", "Spicy & bold", "Thai, Indian, Mexican", "🌶️"], ["western", "Burgers & steak", "Western classics", "🍔"], ["fresh", "Light & fresh", "Salads, pho, poke", "🥗"], ["any", "Surprise me", "I’ll eat anything", "🎲"]] },
      { key: "budget", q: "Budget per person?", sub: "Hong Kong prices, so be honest.", opts: [["low", "Under HK$100", "Cheap and cheerful", "🪙"], ["mid", "HK$100–200", "A proper meal", "💳"], ["high", "HK$200 and up", "Treat yourself", "💅"]] },
      { key: "spice", q: "How much spice?", sub: "We won’t judge. Much.", opts: [["none", "No spice, please", "Flavour, not fire", "🥛"], ["some", "A little kick", "Medium is fine", "🙂"], ["lots", "Bring the heat", "Sweating is the point", "🔥"]] },
      { key: "occasion", q: "What’s the occasion?", sub: "Last question, then food.", tiles: true, opts: [["lunch", "Quick lunch", "Back at my desk by 2", "🍱"], ["date", "Date night", "Somewhere nice", "🕯️"], ["group", "Group feast", "Sharing is caring", "👯"], ["late", "Late-night bite", "After a night out", "🌙"]] }
    ],
    bar: [
      { key: "vibe", q: "What’s the vibe tonight?", sub: "Be honest about the dancing.", tiles: true, opts: [["chill", "Drinks & chat", "A proper bar", "🍸"], ["dance", "Dance all night", "Take me to the club", "🪩"], ["both", "Start chill, end dancing", "Bar first, club later", "🌙"], ["any", "Surprise me", "Wherever the night goes", "🎲"]] },
      { key: "drink", q: "What are you drinking?", sub: "Your usual, or tonight’s mood.", tiles: true, opts: [["cocktails", "Cocktails", "Something pretty", "🍸"], ["wine", "Wine", "A nice glass", "🍷"], ["shots", "Shots", "It’s that kind of night", "🥃"], ["any", "Anything goes", "Surprise me", "🥂"]] },
      { key: "budget", q: "Budget per drink?", sub: "Hong Kong bar prices, brace yourself.", opts: [["low", "Under HK$100", "Keep it easy", "🪙"], ["mid", "HK$100–150", "The usual", "💳"], ["high", "HK$150 and up", "Treat yourself", "💅"]] },
      { key: "crew", q: "Who’s coming?", sub: "Last question, then cheers.", tiles: true, opts: [["date", "Date night", "Somewhere pretty", "💘"], ["friends", "A few friends", "Good drinks, good chat", "👯"], ["big", "Big night out", "The more the merrier", "🎉"]] }
    ],
    day: [
      { key: "need", q: "What are your plans today?", sub: "Tell us what you need, or let the clock decide.", opts: [["coffee", "Just coffee", "A good cup somewhere", "☕"], ["meal", "A proper meal", "Breakfast, lunch or dinner", "🍽️"], ["both", "Coffee and food", "Make a little outing of it", "✨"], ["unsure", "Not sure yet", "Just tell me when you’re going out", "🤷"]] },
      { key: "time", q: "When are you heading out?", sub: "We’ll plan around the time.", opts: [["morning", "Morning", "Breakfast & brunch, then coffee", "🌅"], ["lunch", "Lunchtime", "Lunch, something sweet, coffee", "🌞"], ["evening", "Evening", "Dinner, then dessert", "🌙"]] },
      { key: "area", q: "Where will you be?", sub: "Pick a district, or anywhere.", area: true }
    ]
  };
  function craving(r, p) {
    var adj = 4, why = [], t = function (x) { return r.tags.indexOf(x) !== -1; }, rt = r.rt || 3;
    if (p.mood !== "any" && MOODS[p.mood].indexOf(r.c) !== -1) { adj += 16; why.push(["plus", "😋 " + r.c + ", like you wanted"]); }
    if (p.mood === "spicy" && t("spicy")) adj += 6;
    if (r.pp != null) {
      if (p.budget === "low") { if (r.pp <= 100) { adj += 10; why.push(["plus", "🪙 Under HK$100"]); } else if (r.pp > 150) { adj -= 10; why.push(["minus", "💎 Over your budget"]); } }
      else if (p.budget === "mid") { if (r.pp >= 90 && r.pp <= 200) { adj += 8; why.push(["plus", "💳 In your budget"]); } else if (r.pp > 250) { adj -= 8; why.push(["minus", "💎 Pricier than planned"]); } }
      else if (r.pp >= 180) { adj += 6; why.push(["plus", "💅 Worth the splurge"]); }
    }
    if (p.spice === "lots" && t("spicy")) { adj += 10; why.push(["plus", "🔥 Properly spicy"]); }
    if (p.spice === "none" && t("spicy")) { adj -= 12; why.push(["minus", "🌶️ Spicy, careful"]); }
    if (p.occasion === "lunch" && (t("lunch-set") || t("value") || t("cheap"))) { adj += 8; why.push(["plus", "🍱 Great for lunch"]); }
    if (p.occasion === "date" && (t("cute") || ["Italian", "Western", "Pizza"].indexOf(r.c) !== -1)) { adj += 5; why.push(["plus", "🕯️ Date-friendly"]); }
    if (p.occasion === "group" && (t("group") || t("buffet") || t("big-portion") || ["Pizza", "Indian"].indexOf(r.c) !== -1)) { adj += 6; why.push(["plus", "👯 Good for groups"]); }
    if (p.occasion === "late" && t("late-night")) { adj += 12; why.push(["plus", "🌙 Late-night favourite"]); }
    return { score: Math.max(5, Math.min(99, Math.round(rt / 5 * 60 + adj))), why: why.slice(0, 3) };
  }
  function vibe(b, p) {
    var adj = 4, why = [], t = function (x) { return b.tags.indexOf(x) !== -1; };
    if (p.vibe === "chill" && b.kind === "Bar") { adj += 14; why.push(["plus", "🍸 A proper bar"]); }
    if (p.vibe === "dance" && b.kind !== "Bar") { adj += 16; why.push(["plus", "🪩 Dancing"]); }
    if (p.vibe === "dance" && b.kind === "Bar") adj -= 8;
    if (p.vibe === "both" && b.kind === "Both") { adj += 18; why.push(["plus", "🌙 Bar first, club later"]); }
    if (p.drink !== "any" && t(p.drink)) { adj += 10; why.push(["plus", TAGS[p.drink]]); }
    if (b.pp != null) {
      if (p.budget === "low") { if (b.pp <= 100) { adj += 10; why.push(["plus", "🪙 Under HK$100"]); } else if (b.pp >= 150) { adj -= 8; why.push(["minus", "💎 Over budget"]); } }
      else if (p.budget === "mid") { if (b.pp >= 100 && b.pp <= 150) { adj += 8; why.push(["plus", "💳 In your budget"]); } }
      else if (b.pp >= 150) { adj += 6; why.push(["plus", "💅 Worth the splurge"]); }
    }
    if (p.crew === "date" && t("pretty")) { adj += 6; why.push(["plus", "💘 Pretty for a date"]); }
    if (p.crew === "date" && t("crowded")) adj -= 4;
    if (p.crew === "big" && b.kind !== "Bar") { adj += 6; why.push(["plus", "🎉 Room for the group"]); }
    if (p.crew === "big" && t("small-space")) { adj -= 6; why.push(["minus", "🤏 Small space"]); }
    return { score: Math.max(5, Math.min(99, Math.round(b.rt / 5 * 60 + adj))), why: why.slice(0, 3) };
  }
  QUIZZES.cafe = [
    { key: "milk", q: "How do you take your coffee?", sub: "No judgement. Ok, a little judgement.", opts: [["strong", "Strong & punchy", "Wake me up, emotionally and physically", "⚡"], ["balanced", "Balanced", "Like my life (aspirationally)", "🕊️"], ["milky", "Creamy & milky", "Basically a warm hug in a cup", "☁️"]] },
    { key: "beans", q: "Pick a flavour vibe", sub: "What should the beans taste like?", opts: [["nutty", "Nutty & chocolatey", "Dessert, but make it caffeine", "🍫"], ["fruity", "Fruity & bright", "Fancy notes of berries, apparently", "🍓"], ["any", "I just want caffeine", "No thoughts, only beans", "⚡"]] },
    { key: "drink", q: "What’s your usual order?", sub: "The one you say without looking at the menu.", tiles: true, opts: [["Espresso Tonic", "Espresso tonic", "Fizzy coffee gang", "🫧"], ["Flat White", "Flat white", "The classic", "☕"], ["Latte", "Latte", "Big and cosy", "🥛"], ["Matcha", "Matcha", "Coffee who?", "🍵"], ["Americano", "Americano", "Black, like my humour", "🖤"]] },
    { key: "budget", q: "Wallet status?", sub: "Hong Kong coffee prices are a sport.", tiles: true, opts: [["save", "Saving", "Good coffee, kind price", "🪙"], ["treat", "Treating myself", "Price is a feeling", "💅"]] }
  ];
  function taste(c, p) {
    var base = (c.rt == null ? 3.5 : c.rt) / 5 * 60, adj = 6, why = [];
    function has(t) { return c.taste.indexOf(t) !== -1 || c.tags.indexOf(t) !== -1; }
    var lowish = c.rt != null && c.rt < 4.2;
    if (p.milk === "milky") {
      if (has("milky")) { adj += 12; why.push(["plus", "🥛 Creamy, your thing"]); if (lowish) { adj += Math.round((4.5 - c.rt) * 8); why.push(["plus", "Putri: “too milky”. You: yes please"]); } }
      if (has("strong")) { adj -= 6; why.push(["minus", "💪 Might be too strong"]); }
      if (has("weak")) { adj -= 6; why.push(["minus", "💧 Even milk fans say: weak"]); }
    } else if (p.milk === "strong") {
      if (has("strong")) { adj += 10; why.push(["plus", "💪 Strong, like you asked"]); }
      if (has("roasty")) { adj += 3; if (lowish) { adj += 6; why.push(["plus", "Too roasty for Putri, maybe not for you"]); } }
      if (has("milky")) { adj -= 8; why.push(["minus", "🥛 On the milky side"]); }
      if (has("weak")) { adj -= 8; why.push(["minus", "💧 Weak for you"]); }
    } else {
      if (has("smooth")) { adj += 7; why.push(["plus", "🫧 Smooth & balanced"]); }
      if (has("milky")) adj -= 3;
      if (has("weak")) { adj -= 5; why.push(["minus", "💧 A bit weak"]); }
    }
    if (p.beans === "nutty") {
      if (has("nutty") || has("chocolatey")) { adj += 9; why.push(["plus", "🌰 Nutty beans"]); if (lowish) { adj += 8; why.push(["plus", "Putri’s not into nutty. You are"]); } }
      if (has("fruity")) { adj -= 5; why.push(["minus", "🍓 Fruity beans"]); }
    } else if (p.beans === "fruity") {
      if (has("fruity")) { adj += 9; why.push(["plus", "🍓 Fruity beans"]); if (lowish) { adj += 6; why.push(["plus", "Putri regretted the fruity beans. You won’t"]); } }
      if (has("nutty")) { adj -= 5; why.push(["minus", "🌰 Nutty beans"]); }
    }
    if (p.drink && c.k === p.drink) { adj += 12; why.push(["plus", "☕ Your usual: " + p.drink]); }
    if (p.budget === "save") { if (has("cheap")) { adj += 6; why.push(["plus", "💸 Easy on the wallet"]); } if (has("pricey")) { adj -= 6; why.push(["minus", "💎 Pricey"]); } }
    else if (p.budget === "treat" && has("pricey")) adj += 2;
    if (has("small-portion")) adj -= 2;
    return { score: Math.max(5, Math.min(99, Math.round(base + adj))), why: why.slice(0, 3) };
  }
  var PERSONA = {
    cafe: function (p) { return [{ strong: "⚡", balanced: "🕊️", milky: "☁️" }[p.milk], "The " + { nutty: "Chocolatey", fruity: "Fruity", any: "Chaotic" }[p.beans] + " " + { strong: "Espresso Gremlin", balanced: "Flat White Diplomat", milky: "Latte Cloud" }[p.milk]]; },
    food: function (p) { return { asian: ["🍜", "The Noodle Nomad"], pizza: ["🍕", "The Carb Connoisseur"], spicy: ["🌶️", "The Chilli Champion"], western: ["🍔", "The Comfort Classicist"], fresh: ["🥗", "The Fresh Fanatic"], any: ["🎲", "The Adventurous Eater"] }[p.mood]; },
    bar: function (p) { return { chill: ["🍸", "The Cocktail Connoisseur"], dance: ["🪩", "Dance Floor Royalty"], both: ["🌙", "The Night Shapeshifter"], any: ["🎲", "The Wild Card"] }[p.vibe]; }
  };

  // ---------- Sip & Bite: plans ----------
  function slotsFor(need, time) {
    var M = {
      morning: { coffee: [["cafe", "Coffee"]], meal: [["brunch", "Breakfast & brunch"]], both: [["brunch", "Brunch"], ["cafe", "Coffee after"]] },
      lunch: { coffee: [["cafe", "Coffee"]], meal: [["lunch", "Lunch"], ["dessert", "Something sweet"]], both: [["lunch", "Lunch"], ["dessert", "Something sweet"], ["cafe", "Coffee"]] },
      evening: { coffee: [["cafe", "Evening coffee"]], meal: [["dinner", "Dinner"], ["dessert", "Dessert"]], both: [["dinner", "Dinner"], ["dessert", "Dessert"]] }
    };
    return M[time][need === "unsure" ? "both" : need];
  }
  function poolFor(kind) {
    if (kind === "cafe") return CAFES.filter(function (c) { return c.rt != null; });
    if (kind === "brunch") return CAFES.filter(function (c) { return c.brunch && c.rt != null; }).concat(FOOD.filter(function (f) { return f.brunch; }));
    if (kind === "dessert") return sweetPool().filter(function (x) { return x.rt == null || x.rt >= 3.5; });
    return FOOD.filter(function (f) { return f.rt != null; });
  }
  function scoreSlot(x, kind, anchor, area) {
    var s = (x.rt || 3.5) / 5 * 66, why = [], t = function (k) { return x.tags.indexOf(k) !== -1; };
    if (anchor) { var sp = nearestSpot(x, anchor), k = sp.k; s += Math.max(0, 22 - k * 9); why.push(["plus", "🚶 " + walk(k) + " away" + (sp.branch ? " (" + sp.branch.label + " branch)" : "")]); }
    else if (area && area !== "any") {
      var ab = CENTRE[area] ? nearestSpot(x, CENTRE[area]) : null;
      if (x.d === area) { s += 22; why.push(["plus", "📍 In " + area]); }
      else if (ab && ab.branch && ab.k < 0.8) { s += 20; why.push(["plus", "📍 Branch in " + area]); }
      else if (neighbours(area).indexOf(x.d) !== -1) { s += 14; why.push(["plus", "🚇 One stop away"]); }
      else s += Math.max(0, 10 - kmPts(CENTRE[area] || where(x), where(x)) * 3);
    } else s += 12;
    if (kind === "lunch" && (t("lunch-set") || t("value") || t("cheap"))) { s += 8; why.push(["plus", "🍱 Lunch-friendly"]); }
    if (kind === "dinner" && x.rt >= 4.5) why.push(["plus", "⭐ One of Putri’s best"]);
    if (kind === "brunch") why.push(["plus", "🍳 " + (x.type === "cafe" ? "Food and coffee" : "Brunch-y")]);
    if (kind === "dessert") why.push(["plus", "🍰 Something sweet"]);
    if (kind === "cafe" && x.rk === 1) why.push(["plus", "🏆 Putri’s #1 in " + x.d]);
    return { score: Math.max(5, Math.min(99, Math.round(s))), why: why.slice(0, 3) };
  }
  function planResults() {
    var D = S.day, p = D.profile || { need: "unsure", time: "lunch", area: "Central" }, used = {}, prev = null;
    return slotsFor(p.need, p.time).map(function (sl, i) {
      var ranked = poolFor(sl[0]).filter(function (x) { return !used[x.key]; }).map(function (x) { return { x: x, m: scoreSlot(x, sl[0], prev, p.area) }; }).sort(function (a, b) { return b.m.score - a.m.score; });
      var pick = ranked.length ? ranked[(D.pswaps[i] || 0) % Math.min(ranked.length, 6)] : null;
      if (pick) {
        used[pick.x.key] = 1;
        pick.spot = nearestSpot(pick.x, prev || (p.area !== "any" ? CENTRE[p.area] : null));
        prev = pick.spot.ll;
      }
      return { kind: sl[0], when: sl[1], pick: pick, more: ranked.length > 1 };
    });
  }
  var PLANS = {
    weekend: { name: "Lazy weekend", stops: [["cafe", "Brunch & coffee"], ["food", "Lunch"], ["cafe", "Afternoon coffee"], ["food", "Dinner"], ["dessert", "Dessert"]] },
    workday: { name: "Work-day lunch", stops: [["food", "Lunch set", "lunch"], ["dessert", "Something sweet"], ["cafe", "Coffee after"]] },
    crawl: { name: "Coffee crawl + dinner", stops: [["cafe", "First coffee"], ["cafe", "Second coffee"], ["food", "Dinner"], ["dessert", "Dessert"]] },
    night: { name: "Night out", stops: [["food", "Dinner"], ["dessert", "Dessert"], ["bar", "Cocktails"], ["club", "Dancing"]] }
  };
  function poolOf(kind) {
    if (kind === "cafe") return CAFES; if (kind === "food") return FOOD; if (kind === "dessert") return sweetPool();
    return RATED_BARS.filter(function (b) { return kind === "club" ? b.kind !== "Bar" : b.kind !== "Club"; });
  }
  function planStops() {
    var D = S.day, area = neighbours(D.area), used = {}, prev = null;
    return PLANS[D.plan].stops.map(function (s, i) {
      var centre = CENTRE[D.area];
      var pool = poolOf(s[0]).filter(function (x) { return (area.indexOf(x.d) !== -1 || (centre && branchesOf(x).some(function (b) { return kmPts(centre, b.ll) < 0.8; }))) && (x.rt == null ? s[0] === "dessert" : x.rt >= 3.9); });
      var from = prev ? prev.spot.ll : centre;
      if (!pool.length && from) pool = poolOf(s[0]).filter(function (x) { return x.rt == null || x.rt >= 3.5; }).slice().sort(function (a, b) { return kmPts(from, where(a)) - kmPts(from, where(b)); }).slice(0, 6);
      pool.sort(function (a, b) {
        var home = (a.d === D.area ? 0 : 1) - (b.d === D.area ? 0 : 1);
        var lunch = s[2] === "lunch" ? ((b.tags.indexOf("lunch-set") !== -1 || b.tags.indexOf("value") !== -1) - (a.tags.indexOf("lunch-set") !== -1 || a.tags.indexOf("value") !== -1)) : 0;
        var near = s[0] === "dessert" && prev ? distTo(a, prev.spot.ll) - distTo(b, prev.spot.ll) : 0;
        return lunch || near || home || byRank(a, b);
      });
      var free = pool.filter(function (x) { return !used[x.key]; });
      var pick = free.length ? free[(D.swaps[i] || 0) % free.length] : null;
      var spot = pick ? nearestSpot(pick, from) : null;
      if (pick) { used[pick.key] = 1; prev = { x: pick, spot: spot }; }
      return { kind: s[0], when: s[1], x: pick, spot: spot, options: free.length };
    });
  }

  // ---------- Spinners ----------
  function spinPool(kind) {
    var st = S[kind], loc = st.spinLoc || "any";
    var list = kind === "food" ? FOOD : RATED_BARS.filter(function (b) { return st.kind === "all" || (st.kind === "bar" ? b.kind !== "Club" : b.kind !== "Bar"); });
    return list.filter(function (x) { return x.rt != null && (loc === "any" || x.d === loc); });
  }
  function weightOf(x) { return x.rt * x.rt; }
  function weightedPick(list) {
    var tot = list.reduce(function (s, x) { return s + weightOf(x); }, 0), roll = Math.random() * tot;
    for (var i = 0; i < list.length; i++) { roll -= weightOf(list[i]); if (roll <= 0) return list[i]; }
    return list[list.length - 1];
  }
  function contenders(kind) {
    var st = S[kind], key = (st.spinLoc || "any") + "|" + (st.kind || "");
    if (st.cont && st.contKey === key) return st.cont;
    st.cont = spinPool(kind).sort(function (a, b) { return a.n.localeCompare(b.n); }).map(function (x) { return x.key; });
    st.contKey = key; st.spinPick = null; st.spinIdx = null;
    return st.cont;
  }
  function locChips(kind) {
    var st = S[kind], list = kind === "food" ? FOOD : RATED_BARS, ds = districtsOf(list.filter(function (x) { return x.rt != null; })), loc = st.spinLoc || "any";
    return '<div class="chips"><button class="pill" data-spinloc="any" aria-pressed="' + (loc === "any") + '">🌏 Anywhere</button>' +
      ds.map(function (d) { return '<button class="pill" data-spinloc="' + esc(d) + '" aria-pressed="' + (loc === d) + '">' + esc(d) + "</button>"; }).join("") + "</div>";
  }
  function slices(keys) {
    var w = keys.map(function (k) { return weightOf(find(k)); }), tot = w.reduce(function (s, x) { return s + x; }, 0), acc = 0;
    return keys.map(function (k, i) { var a = acc / tot * 360; acc += w[i]; var b = acc / tot * 360; return { a0: a, a1: b, mid: (a + b) / 2 }; });
  }
  function short(n) { return n.length > 13 ? n.slice(0, 12) + "…" : n; }
  function wheel(kind, keys, st) {
    var n = keys.length, cx = 130, cy = 130, R = 118, seg = "", labels = "", sl = slices(keys);
    if (!n) return '<p class="sub" style="text-align:center">Nothing here yet.</p>';
    var fills = kind === "food" ? ["#FFF8DF", "#F8CED3", "#FBE7A1", "#FFFFFF"] : ["#F6D5DA", "#FFFDF8", "#EFE9A8", "#FFFFFF"];
    var showLabels = n <= 24, fs = n <= 8 ? 10.5 : n <= 14 ? 9.5 : 8;
    for (var i = 0; i < n; i++) {
      var a0 = sl[i].a0 * Math.PI / 180 - Math.PI / 2, a1 = sl[i].a1 * Math.PI / 180 - Math.PI / 2, mid = sl[i].mid;
      var x0 = cx + R * Math.cos(a0), y0 = cy + R * Math.sin(a0), x1 = cx + R * Math.cos(a1), y1 = cy + R * Math.sin(a1);
      var win = st.spinIdx === i && st.spinPick, fill = fills[i % (n % 4 === 1 ? 3 : 4)];
      seg += n === 1 ? '<circle cx="130" cy="130" r="118" fill="' + fill + '"' + (win ? ' class="win"' : "") + "/>" :
        '<path d="M130 130L' + x0.toFixed(1) + " " + y0.toFixed(1) + "A118 118 0 " + (sl[i].a1 - sl[i].a0 > 180 ? 1 : 0) + " 1 " + x1.toFixed(1) + " " + y1.toFixed(1) + 'Z" fill="' + fill + '" stroke="#3B2620" stroke-width="' + (n > 24 ? 0.6 : 1.5) + '"' + (win ? ' class="win"' : "") + "/>";
      if (showLabels) {
        var flip = kind === "bar" && mid > 180;
        labels += '<text class="wl' + (win ? " win" : "") + '" style="font-size:' + (win ? fs + 1.5 : fs) + 'px" transform="rotate(' + (flip ? mid + 90 : mid - 90) + ' 130 130)" x="' + (flip ? 19 : 241) + '" y="' + (130 + fs * 0.35).toFixed(1) + '" text-anchor="' + (flip ? "start" : "end") + '">' + esc(short(find(keys[i]).n)) + "</text>";
      }
    }
    var body = '<g id="wheel-' + kind + '" class="wheel-rot" style="transform:rotate(' + (kind === "food" ? st.spinAngle : 0) + 'deg)">' + seg + labels + "</g>" +
      '<circle cx="130" cy="130" r="118" fill="none" stroke="#3B2620" stroke-width="3"/>';
    if (kind === "food") {
      body += '<circle cx="130" cy="130" r="34" fill="#F5D45E" stroke="#3B2620" stroke-width="2.5"/><text x="130" y="135" text-anchor="middle" class="hubtxt">Lazy Susan</text>' +
        '<g><line class="stick" x1="122" y1="-6" x2="127" y2="34"/><line class="stick" x1="138" y1="-6" x2="133" y2="34"/><line class="stick-tip" x1="127" y1="26" x2="127.9" y2="34"/><line class="stick-tip" x1="133" y1="26" x2="132.1" y2="34"/></g>';
    } else {
      body += '<g id="bottle" class="wheel-rot" style="transform:rotate(' + st.spinAngle + 'deg)"><g transform="translate(130 130) scale(.78) translate(-130 -130)"><path d="M124 168H136C141 168 144 165 144 160V122C144 112 136 108 135 100V84H125V100C124 108 116 112 116 122V160C116 165 119 168 124 168Z" fill="#1F4D3A" stroke="#3B2620" stroke-width="2.5"/>' +
        '<rect x="117" y="128" width="26" height="20" rx="3" fill="#F6D5DA"/><text x="130" y="141.5" text-anchor="middle" class="hubtxt" style="font-size:8px">PUTRI</text><rect x="124" y="78" width="12" height="8" rx="2" fill="#8C2155" stroke="#3B2620" stroke-width="2"/></g></g>';
    }
    return '<div class="spin-stage"><svg class="wheel" viewBox="-10 -14 280 290" role="img" aria-label="' + (kind === "food" ? "Lazy Susan" : "Bottle") + " with " + plural(n, "place") + '">' + body + "</svg></div>" +
      '<p class="meta" style="text-align:center;margin:-6px 0 0">' + plural(n, "place") + " on the wheel · higher-rated places get bigger slices</p>" +
      (showLabels ? "" : '<details class="onwheel"><summary>See all ' + n + " on the wheel</summary><p>" + keys.map(function (k) { return esc(find(k).n); }).join(" · ") + "</p></details>");
  }
  function spin(kind) {
    var st = S[kind], keys = contenders(kind); if (!keys.length) return;
    var pick = weightedPick(keys.map(find)), i = keys.indexOf(pick.key), mid = slices(keys)[i].mid, cur = st.spinAngle, target;
    if (kind === "food") target = cur + 1440 + (((-mid - cur) % 360) + 360) % 360;
    else target = cur + 1440 + (((mid - cur) % 360) + 360) % 360;
    st.spinAngle = target; st.spinPick = null; st.spinIdx = null;
    var el = document.getElementById(kind === "food" ? "wheel-food" : "bottle"); if (el) el.style.transform = "rotate(" + target + "deg)";
    app.querySelectorAll(".wheel .win").forEach(function (w) { w.classList.remove("win"); });
    clearTimers(); timers.push(setTimeout(function () { st.spinPick = pick.key; st.spinIdx = i; render(true); }, reduceMotion ? 0 : 2300));
  }

  // ---------- Votes & notes (same Apps Script as Bean There) ----------
  function voteKey(x) { return (x.type === "cafe" ? "" : x.type + ":") + x.d + "|" + x.n; }
  function apiPost(body) {
    body.device = device;
    return fetch(API, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(body) }).then(function (r) { return r.json(); });
  }
  function ago(ms) { var m = Math.max(1, Math.round((Date.now() - ms) / 6e4)); return m < 60 ? m + "m" : m < 1440 ? Math.round(m / 60) + "h" : Math.round(m / 1440) + "d"; }
  function refreshVotes() {
    if (!API) return;
    fetch(API + (API.indexOf("?") === -1 ? "?" : "&") + "action=summary").then(function (r) { return r.json(); })
      .then(function (s) { if (s && s.ok) { S.votes = s.votes || {}; S.recent = s.recent || []; if (current().name === "place" || current().name === "putri") render(true); } }).catch(function () {});
  }
  function voteBlock(x) {
    if (x.rt == null) return "";
    var v = S.votes[voteKey(x)] || { agree: 0, disagree: 0 }, mine = S.myVotes[voteKey(x)];
    return '<div class="vote"><b>Putri says ★ ' + x.rt + ". Do you agree?</b>" +
      '<div class="vote-btns"><button class="pill" data-vote="agree" data-key="' + esc(x.key) + '" aria-pressed="' + (mine === "agree") + '">👍 Agree' + (v.agree ? " · " + v.agree : "") + '</button><button class="pill" data-vote="disagree" data-key="' + esc(x.key) + '" aria-pressed="' + (mine === "disagree") + '">👎 Not for me' + (v.disagree ? " · " + v.disagree : "") + "</button></div>" +
      (API ? "" : '<small class="meta">Votes open soon.</small>') + "</div>";
  }

  // ---------- Screens ----------
  var V = {};
  function hello() { var h = new Date().getHours(); return h < 11 ? "Good morning! Coffee first?" : h < 15 ? "Lunchtime somewhere. Where to?" : h < 18 ? "Afternoon pick-me-up?" : h < 21 ? "Dinner plans?" : "Drinks, anyone?"; }

  V.home = function () {
    return '<div class="hub"><div class="hub-head"><div class="duo">' + cup("") + dumpling("") + coupe("") + '</div><h1 class="l-title">Out &amp; About</h1><span class="stamp">by Putri</span><p class="hello">' + hello() + "</p></div>" +
      '<label class="search"><span aria-hidden="true">🔎</span><input id="hq" type="search" placeholder="Search any café, restaurant, bar or dessert…" value="' + esc(S.hq) + '" autocomplete="off" aria-label="Search every place"></label>' +
      (S.hq.trim() ? searchResults() : homeBody()) + "</div>";
  };
  function searchResults() {
    var qq = S.hq.trim().toLowerCase();
    var hits = FOOD.concat(CAFES, BARS, DESSERTS).filter(function (x) { return [x.n, x.d, x.c || "", x.k || "", x.o, x.tags.join(" ")].join(" ").toLowerCase().indexOf(qq) !== -1; })
      .sort(function (a, b) { return (a.n.toLowerCase().indexOf(qq) === 0 ? 0 : 1) - (b.n.toLowerCase().indexOf(qq) === 0 ? 0 : 1) || (b.rt || 0) - (a.rt || 0); });
    return '<p class="meta" style="margin:0">' + plural(hits.length, "place") + " for “" + esc(S.hq.trim()) + "”</p>" +
      (hits.length ? '<ul class="list">' + hits.slice(0, 30).map(function (x) { return '<li><a class="row" href="' + href(x) + '"><span class="n">' + icon(x) + "</span><span><b>" + esc(x.n) + "</b><small>" + esc(x.d + (x.c && x.type !== "dessert" ? " · " + x.c : "") + (x.o ? " · " + x.o : "")) + '</small></span><span class="score">' + (x.rt != null ? "★ " + x.rt : "") + "</span></a></li>"; }).join("") + "</ul>"
        : '<div class="empty">Nothing found. Try a dish, a cuisine or a district, or <a href="#note">suggest a place to Putri</a>.</div>');
  }
  function installTip() {
    var standalone = (window.matchMedia && matchMedia("(display-mode: standalone)").matches) || navigator.standalone;
    var ua = navigator.userAgent || "", ios = /iPhone|iPad|iPod/.test(ua), android = /Android/.test(ua);
    if (standalone || (!ios && !android) || load("oa-tip-install", false)) return "";
    return '<div class="tip"><b>📲 Keep Out &amp; About on your home screen</b><small>' + (ios ? "Tap the Share button (the square with an arrow), then “Add to Home Screen”." : "Tap ⋮ in the top corner, then “Install app” or “Add to Home screen”.") + '</small><button class="tip-x" data-dismiss="oa-tip-install" aria-label="Dismiss">✕</button></div>';
  }
  function homeBody() {
    var fresh = ALL.concat(BARS.filter(function (b) { return b.rt == null; })).filter(isNew).sort(function (a, b) { return b.added - a.added; });
    return (load("oa-tip-welcome", false) ? "" : '<div class="tip"><b>👋 New here?</b><small>These are Putri’s honest picks around Hong Kong. Not sure where to start? Let her plan it.</small><a class="pill solid" href="#sip/plans" style="justify-self:start">Plan my outing ✨</a><button class="tip-x" data-dismiss="oa-tip-welcome" aria-label="Dismiss">✕</button></div>') +
      '<a class="mod bean" href="#bean">' + cup("") + "<span><b>Bean There</b><small>Putri’s café picks · " + plural(CAFES.length, "café") + '</small></span><span class="go" aria-hidden="true">→</span></a>' +
      '<a class="mod food" href="#food">' + dumpling("") + "<span><b>Seconds, Please</b><small>Putri’s restaurant picks · " + plural(FOOD.length, "place") + '</small></span><span class="go" aria-hidden="true">→</span></a>' +
      '<a class="mod bar" href="#bar">' + coupe("") + "<span><b>Pour Decisions</b><small>Putri’s bars &amp; clubs · " + RATED_BARS.length + ' reviewed</small></span><span class="go" aria-hidden="true">→</span></a>' +
      '<a class="mod day" href="#sip"><span class="pair">' + cup("") + dumpling("") + coupe("") + '</span><span><b>Sip &amp; Bite</b><small>Coffee, food and drinks: plan your outing</small></span><span class="go" aria-hidden="true">→</span></a>' +
      '<div class="mini-row"><a class="mini md-tile" href="#myday"><b>📋 My day</b><small>' + plural(S.myday.length, "stop") + ' planned</small></a><a class="mini" href="#near"><b>📍 Near me</b><small>Closest good places</small></a>' +
      '<a class="mini" href="#saved"><b>♡ Saved</b><small>' + plural(S.saved.filter(find).length, "place") + '</small></a><a class="mini" href="#sweet"><b>🍰 Sweet tooth</b><small>' + plural(DESSERTS.length, "dessert spot") + "</small></a></div>" +
      (fresh.length ? '<span class="label">🆕 New this month</span><div class="chips">' + fresh.slice(0, 8).map(function (x) { return '<a class="pill" href="' + href(x) + '">' + icon(x) + " " + esc(x.n) + "</a>"; }).join("") + "</div>" : "") +
      '<a class="banner" href="#putri"><span aria-hidden="true" style="font-size:24px">🌷</span><span><b>Putri’s page</b><small>' + plural(ALL.length, "place") + " tried across " + districtsOf(ALL).length + " districts</small></span></a>" +
      '<a class="banner" href="#note"><span aria-hidden="true" style="font-size:24px">💌</span><span><b>Send Putri a note</b><small>Suggest a place, report one that’s closed, or say hi</small></span></a>' + installTip();
  }

  // Bean There lives on as its own site; here you get its map and café pages, plus links to the rest.
  V.bean = function () {
    return '<div class="landing">' + DOODLE + floaties([["8%", "12%", 0, "☕"], ["84%", "9%", 1.2, "🌷"], ["10%", "78%", 2.1, "🌷"], ["86%", "70%", .6, "☕"]]) +
      '<div class="bubble">Putri’s honest coffee picks around Hong Kong.</div>' + cup("mascot") +
      '<div><h1 class="l-title" style="font-size:58px">Bean<br>There</h1><span class="stamp">by Putri</span></div>' +
      '<a class="cta cta-main" href="#bean/quiz">Find my perfect cup ☕</a><a class="cta cta-ghost" href="#bean/map">Explore the café map</a>' +
      '<p class="l-stats">' + plural(CAFES.length, "café") + " · " + districtsOf(CAFES).length + " districts · " + CAFES.filter(function (c) { return c.rt === 5; }).length + " perfect 5s</p></div>";
  };
  function brewView() {
    return '<div class="cook" style="background:linear-gradient(170deg, var(--lilac-soft), var(--lilac-bg))">' + cup("mascot") + '<h1>Brewing for you</h1><p><span id="cookline">Tasting ' + CAFES.length + " cafés</span>…</p></div>";
  }
  V["bean/quiz"] = function () { if (S.cooking === "cafe") return brewView(); startQuiz("cafe"); return quizView("cafe"); };
  function cafeCard(c, i, m) {
    return '<article class="card"><div class="card-head"><span class="rank' + (i < 3 ? " r" + (i + 1) : "") + '">' + (i + 1) + "</span>" +
      '<div><h3><a href="' + href(c) + '" style="text-decoration:none">' + esc(c.n) + '</a></h3><span class="meta">' + esc(c.d) + " · Putri ★ " + c.rt + (price(c) ? " · " + esc(price(c)) : "") + '</span></div><span class="match">' + m.score + "%</span></div>" +
      (c.o ? '<p class="order">Get: <b>' + esc(c.o) + "</b></p>" : "") + (c.no ? '<p class="note">“' + esc(c.no) + "”</p>" : "") +
      (m.why.length ? '<div class="chips">' + m.why.map(function (w) { return '<span class="chip ' + w[0] + '">' + esc(w[1]) + "</span>"; }).join("") + "</div>" : "") +
      '<div class="chips">' + addBtn(c) + "</div></article>";
  }
  V["bean/results"] = function () {
    var p = S.bean.profile; if (!p) return null;
    var per = PERSONA.cafe(p), ranked = CAFES.filter(function (c) { return c.rt != null; }).map(function (c) { return { c: c, m: taste(c, p) }; }).sort(function (a, b) { return b.m.score - a.m.score; });
    return '<div class="pad"><div class="persona"><span class="big" aria-hidden="true">' + per[0] + '</span><span class="label">Your coffee personality</span><h1 style="font-size:28px">' + per[1] + '</h1><p class="sub">Your best matches across Hong Kong.</p></div>' +
      ranked.slice(0, 3).map(function (x, i) { return cafeCard(x.c, i, x.m); }).join("") +
      '<span class="label">Also worth a try</span><ul class="list">' + ranked.slice(3, 9).map(function (x) { return '<li><a class="row" href="' + href(x.c) + '"><span class="n">☕</span><span><b>' + esc(x.c.n) + "</b><small>" + esc(x.c.d) + " · " + esc(x.c.o) + '</small></span><span class="score">' + x.m.score + "%</span></a></li>"; }).join("") + "</ul>" +
      '<div class="chips"><a class="pill" href="#bean/quiz" data-retake="cafe">Retake</a><a class="pill solid" href="#bean/map">See the café map</a></div></div>';
  };
  V["bean/map"] = function () {
    var B = S.bean, ds = districtsOf(CAFES);
    if (ds.indexOf(B.pin) === -1) B.pin = ds[0];
    var here = CAFES.filter(function (c) { return c.d === B.pin; }).sort(byRank);
    return '<div class="pad"><h1 class="app-title">Café map</h1>' + mtr(ds, { pin: B.pin, size: function (d) { return CAFES.filter(function (c) { return c.d === d; }).length; } }) +
      '<div class="sheet"><div class="h-row"><h2 style="font-size:22px">' + esc(B.pin) + '</h2><span class="meta">' + plural(here.length, "café") + "</span></div>" + placeRows(here) + "</div></div>";
  };

  // Seconds, Please
  function foodCard(r, i, m) {
    return '<article class="card"><div class="card-head"><span class="rank' + (i < 3 ? " r" + (i + 1) : "") + '">' + (i + 1) + "</span>" +
      '<div><h3><a href="' + href(r) + '" style="text-decoration:none">' + esc(r.n) + '</a></h3><span class="meta">' + esc(r.d) + (r.c ? " · " + esc(r.c) : "") + " · Putri ★ " + r.rt + "</span></div>" +
      (m ? '<span class="match">' + m.score + "%</span>" : '<span class="pp">' + esc(price(r)) + "</span>") + "</div>" +
      (r.o ? '<p class="order">Order: <b>' + esc(r.o) + "</b>" + (price(r) ? ' <span class="meta">· ' + esc(price(r)) + " pp</span>" : "") + "</p>" : "") +
      (r.no ? '<p class="note">“' + esc(r.no) + "”</p>" : "") +
      (m && m.why.length ? '<div class="chips">' + m.why.map(function (w) { return '<span class="chip ' + w[0] + '">' + esc(w[1]) + "</span>"; }).join("") + "</div>" : tagChips(r)) +
      dessertLine(r) + '<div class="chips">' + addBtn(r) + "</div></article>";
  }
  function foodFiltered() {
    var F = S.food, qq = F.query.trim().toLowerCase();
    return FOOD.filter(function (r) {
      if (F.budget < 450 && r.pp != null && r.pp > F.budget) return false;
      if (F.lunch && !(r.tags.indexOf("lunch-set") !== -1 || r.tags.indexOf("value") !== -1 || r.tags.indexOf("cheap") !== -1)) return false;
      if (qq && [r.n, r.d, r.c, r.o, r.no, r.tags.join(" ")].join(" ").toLowerCase().indexOf(qq) === -1) return false;
      return true;
    });
  }
  function budgetLabel(v) { return v >= 450 ? "Any budget" : "Up to HK$" + v + " pp"; }
  var FOOD_LINES = function () { return ["Honest picks from Putri’s own table.", FOOD.length + " restaurants, all tried by Putri.", "Pizza, pho, curry and more. Something for every craving.", "Good food, honest reviews."]; };
  V.food = function () {
    var lines = FOOD_LINES();
    return '<div class="landing">' + DOODLE + floaties([["8%", "12%", 0, "🍕"], ["84%", "9%", 1.2, "🍜"], ["10%", "78%", 2.1, "🌮"], ["86%", "70%", .6, "🍛"], ["50%", "92%", 3, "🥢"], ["76%", "36%", 1.8, "🍔"]]) +
      '<div class="bubble">Hungry? Let’s find your next favourite spot.</div>' + dumpling("mascot") +
      '<div><h1 class="l-title" style="font-size:52px">Seconds,<br>Please</h1><span class="stamp">by Putri</span></div>' +
      '<p class="tagline" id="tagline">' + esc(lines[S.food.tagline % lines.length]) + "</p>" +
      '<a class="cta cta-main" href="#food/quiz">What am I craving? 🍽️</a><a class="cta cta-ghost" href="#food/map">Just show me the map</a>' +
      '<p class="l-stats">' + plural(FOOD.length, "restaurant") + " · " + districtsOf(FOOD).length + " districts · " + FOOD.filter(function (r) { return r.rt === 5; }).length + " perfect 5s</p></div>";
  };
  function quizView(kind, backHref) {
    var QZ = QUIZZES[kind], st = S.quiz, Q = QZ[st.step];
    return '<div class="quiz"><button class="back" data-qback="1">← ' + (st.step ? "Back" : "Home") + "</button>" +
      '<div class="steps" aria-label="Question ' + (st.step + 1) + " of " + QZ.length + '">' + QZ.map(function (_, i) { return '<i class="' + (i < st.step ? "on" : i === st.step ? "now" : "") + '">' + (i < st.step ? "✓" : i + 1) + "</i>"; }).join("") + "</div>" +
      '<h1 class="q">' + esc(Q.q) + '</h1><p class="q-sub">' + esc(Q.sub) + "</p>" +
      (Q.area ? '<div class="area-grid"><button class="pill solid" data-answer="any">🌏 Anywhere</button>' + districtsOf(FOOD).filter(function (d) { return CAFES.some(function (c) { return c.d === d; }); }).map(function (d) { return '<button class="pill" data-answer="' + esc(d) + '">' + esc(d) + "</button>"; }).join("") + "</div>"
        : '<div class="opts' + (Q.tiles ? " tiles" : "") + '">' + Q.opts.map(function (o) { return '<button class="opt" data-answer="' + o[0] + '"><span class="art" aria-hidden="true">' + o[3] + "</span><span>" + esc(o[1]) + "<small>" + esc(o[2]) + "</small></span></button>"; }).join("") + "</div>") + "</div>";
  }
  function startQuiz(kind) { if (!S.quiz || S.quiz.kind !== kind) S.quiz = { kind: kind, step: 0, draft: {} }; }
  V["food/quiz"] = function () {
    if (S.cooking === "food") return cookView();
    startQuiz("food"); return quizView("food");
  };
  function cookView() {
    return '<div class="cook"><svg viewBox="0 0 180 170" aria-hidden="true">' +
      '<g class="steam" opacity=".7"><path d="M66 34c-8-10 8-14 0-26" stroke="var(--straw-deep)" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M114 34c-8-10 8-14 0-26" stroke="var(--straw-deep)" stroke-width="3" fill="none" stroke-linecap="round"/></g>' +
      '<g class="lid"><path d="M30 76C30 50 150 50 150 76Z" fill="#C9C2B8" stroke="#6B5A4C" stroke-width="3"/><circle cx="90" cy="46" r="7" fill="#6B5A4C"/></g>' +
      '<path d="M26 78H154L146 128C145 134 140 138 134 138H46C40 138 35 134 34 128Z" fill="var(--mellow)" stroke="#6B5A4C" stroke-width="3"/>' +
      '<path d="M26 92H10M154 92H170" stroke="#6B5A4C" stroke-width="5" stroke-linecap="round"/>' +
      '<ellipse cx="90" cy="150" rx="78" ry="9" fill="var(--straw)" stroke="var(--straw-deep)" stroke-width="2"/></svg>' +
      '<h1>Cooking up your matches</h1><p><span id="cookline">Checking ' + FOOD.length + " menus</span>…</p></div>";
  }
  V["food/results"] = function () {
    var p = S.food.profile; if (!p) return null;
    var per = PERSONA.food(p), ranked = FOOD.filter(function (r) { return r.rt != null; }).map(function (r) { return { r: r, m: craving(r, p) }; }).sort(function (a, b) { return b.m.score - a.m.score; });
    return '<div class="pad"><div class="persona"><span class="big" aria-hidden="true">' + per[0] + '</span><span class="label">Your eating personality</span><h1 style="font-size:28px">' + per[1] + '</h1><p class="sub">Your best matches across Hong Kong.</p></div>' +
      ranked.slice(0, 3).map(function (x, i) { return foodCard(x.r, i, x.m); }).join("") +
      '<span class="label">Also worth a try</span><ul class="list">' + ranked.slice(3, 8).map(function (x) { return '<li><a class="row" href="' + href(x.r) + '"><span class="n">🍽️</span><span><b>' + esc(x.r.n) + "</b><small>" + esc(x.r.d) + (x.r.c ? " · " + esc(x.r.c) : "") + (price(x.r) ? " · " + esc(price(x.r)) : "") + '</small></span><span class="score">' + x.m.score + "%</span></a></li>"; }).join("") + "</ul>" +
      '<div class="chips"><a class="pill" href="#food/quiz" data-retake="food">Retake</a><a class="pill solid" href="#food/spin">Still can’t decide? Spin 🥢</a></div></div>';
  };
  V["food/map"] = function () {
    var F = S.food, list = foodFiltered(), counts = {}, ds = districtsOf(FOOD);
    list.forEach(function (r) { counts[r.d] = (counts[r.d] || 0) + 1; });
    if (!counts[F.pin] && list.length) F.pin = list[0].d;
    var here = list.filter(function (r) { return r.d === F.pin; }).sort(byRank);
    return '<div class="pad"><h1 class="app-title">Where are we eating?</h1>' +
      '<label class="search"><span aria-hidden="true">🔎</span><input id="fq" type="search" placeholder="Search dish, cuisine or place…" value="' + esc(F.query) + '" autocomplete="off" aria-label="Search restaurants"></label>' +
      '<div class="slider"><div class="h-row"><label for="budget" class="meta">Budget per person</label><b id="budget-lbl">' + budgetLabel(F.budget) + '</b></div><input id="budget" type="range" min="60" max="450" step="10" value="' + F.budget + '"></div>' +
      '<div class="chips"><button class="pill" data-lunch="1" aria-pressed="' + F.lunch + '">🍱 Lunch sets & good value</button><a class="pill" href="#food/lunch">Lunch Set Finder →</a><span class="meta" style="align-self:center">' + list.length + " of " + FOOD.length + " match</span></div>" +
      mtr(ds, { pin: F.pin, size: function (d) { return FOOD.filter(function (r) { return r.d === d; }).length; }, dim: function (d) { return !counts[d]; } }) +
      '<div class="sheet"><div class="h-row"><h2 style="font-size:22px">' + esc(F.pin) + '</h2><span class="meta">' + plural(here.length, "match") .replace("matchs", "matches") + "</span></div>" +
      (here.length ? '<ul class="list">' + here.map(function (r) { return '<li><a class="row" href="' + href(r) + '"><span class="n">' + (r.rk ? r.rk : "·") + "</span><span><b>" + esc(r.n) + "</b><small>" + esc(r.c || "") + (r.o ? " · " + esc(r.o) : "") + '</small></span><span class="score">' + esc(price(r)) + "</span></a></li>"; }).join("") + "</ul>" : '<p class="sub">Nothing here with these filters. Try a bigger budget.</p>') + "</div></div>";
  };
  V["food/lunch"] = function () {
    var F = S.food, cap = Math.min(F.budget, 160);
    var list = FOOD.filter(function (r) { return r.tags.indexOf("lunch-set") !== -1 || r.tags.indexOf("value") !== -1 || r.tags.indexOf("cheap") !== -1 || (r.pp != null && r.pp <= 100 && r.rt >= 4); })
      .filter(function (r) { return r.pp == null || r.pp <= cap; }).sort(function (a, b) { return (a.pp || 999) - (b.pp || 999); });
    var groups = {}; list.forEach(function (r) { (groups[r.d] = groups[r.d] || []).push(r); });
    return '<div class="pad"><h1 class="app-title">Lunch Set Finder</h1><p class="sub">Putri’s lunch sets, value spots and cheap eats, cheapest first.</p>' +
      '<div class="slider"><div class="h-row"><label for="budget" class="meta">Lunch budget</label><b id="budget-lbl">Up to HK$' + cap + '</b></div><input id="budget" type="range" min="60" max="160" step="10" value="' + cap + '"></div>' +
      '<div class="banner"><span aria-hidden="true" style="font-size:24px">🕛</span><span><b>Most HK lunch sets run around 12–3pm on weekdays</b><small>Check the restaurant before you go</small></span></div>' +
      districtsOf(list).map(function (d) {
        return '<span class="label">' + esc(d) + '</span><ul class="list">' + groups[d].map(function (r) {
          return '<li><a class="row" href="' + href(r) + '"><span class="n">🍱</span><span><b>' + esc(r.n) + "</b><small>" + esc(r.o || r.c) + '</small></span><span class="score">' + esc(price(r) || "–") + "</span></a></li>";
        }).join("") + "</ul>";
      }).join("") + (list.length ? "" : '<p class="sub">Nothing under this budget yet. Slide it up a little.</p>') + "</div>";
  };
  V["food/spin"] = function () {
    var F = S.food, pick = F.spinPick && find(F.spinPick), keys = contenders("food");
    return '<div class="pad"><h1 class="app-title">Spin the Chopsticks</h1><p class="sub">Every restaurant in the area you pick goes on the lazy Susan. Spin it, and whatever stops under the chopsticks is dinner.</p>' +
      '<span class="label">Where are you eating?</span>' + locChips("food") + wheel("food", keys, F) +
      '<button class="cta cta-main spin-btn" data-spin="food" style="justify-self:center;width:auto;padding:12px 32px">Spin! 🥢</button>' +
      (pick ? '<div class="result">' + foodCard(pick, 0, null) + "</div>" : "") + "</div>";
  };

  // Pour Decisions
  function barCard(b, i, m) {
    return '<article class="card"><div class="card-head"><span class="rank' + (i < 3 ? " r" + (i + 1) : "") + '">' + (i + 1) + "</span>" +
      '<div><h3><a href="' + href(b) + '" style="text-decoration:none">' + esc(b.n) + '</a></h3><span class="meta">' + esc(b.d) + " · " + esc(b.c) + " · Putri ★ " + b.rt + "</span></div>" +
      (m ? '<span class="match">' + m.score + "%</span>" : '<span class="pp">' + esc(price(b)) + "</span>") + "</div>" +
      (b.o ? '<p class="order">Drink: <b>' + esc(b.o) + "</b>" + (price(b) ? ' <span class="meta">· ' + esc(price(b)) + "</span>" : "") + "</p>" : "") +
      (b.no ? '<p class="note">“' + esc(b.no) + "”</p>" : "") +
      (m && m.why.length ? '<div class="chips">' + m.why.map(function (w) { return '<span class="chip ' + w[0] + '">' + esc(w[1]) + "</span>"; }).join("") + "</div>" : tagChips(b)) +
      '<div class="chips">' + addBtn(b) + "</div></article>";
  }
  V.bar = function () {
    var lines = ["Putri’s honest picks for a night out.", "Cocktails, dance floors, and the in-betweens.", RATED_BARS.length + " bars and clubs reviewed, more on the way.", "Good drinks, honest reviews."];
    return '<div class="landing">' + DOODLE + floaties([["8%", "12%", 0, "🍸"], ["84%", "9%", 1.2, "🍒"], ["10%", "78%", 2.1, "🪩"], ["86%", "70%", .6, "🍷"], ["50%", "92%", 3, "🥂"], ["76%", "36%", 1.8, "🍋"]]) +
      '<div class="bubble">Out tonight? Let’s find your spot.</div>' + coupe("mascot") +
      '<div><h1 class="l-title" style="font-size:52px">Pour<br>Decisions</h1><span class="stamp">by Putri</span></div>' +
      '<p class="tagline" id="tagline">' + esc(lines[S.bar.tagline % lines.length]) + "</p>" +
      '<a class="cta cta-main" href="#bar/quiz">What’s the vibe tonight? 🍸</a><a class="cta cta-ghost" href="#bar/hotspots">Show me the hotspots</a>' +
      '<p class="l-stats">' + RATED_BARS.length + " reviewed · " + (BARS.length - RATED_BARS.length) + " to review · " + districtsOf(BARS).length + " districts</p></div>";
  };
  V["bar/quiz"] = function () {
    if (S.cooking === "bar") return mixView();
    startQuiz("bar"); return quizView("bar");
  };
  function mixView() {
    return '<div class="cook bar-cook"><svg class="mix" viewBox="0 0 180 170" aria-hidden="true">' +
      '<defs><clipPath id="bowl"><path d="M36 48H144C142 86 118 106 90 106C62 106 38 86 36 48Z"/></clipPath></defs>' +
      '<g clip-path="url(#bowl)"><rect class="liquid" x="30" y="48" width="120" height="62" fill="#F4A7B9"/><circle class="bub b1" cx="74" cy="100" r="3" fill="#FFFFFF"/><circle class="bub b2" cx="98" cy="100" r="2.5" fill="#FFFFFF"/><circle class="bub b3" cx="86" cy="100" r="2" fill="#FFFFFF"/></g>' +
      '<path d="M36 48H144C142 86 118 106 90 106C62 106 38 86 36 48Z" fill="none" stroke="#3B2620" stroke-width="3"/>' +
      '<path d="M90 106V140" stroke="#3B2620" stroke-width="4" stroke-linecap="round"/><ellipse cx="90" cy="143" rx="26" ry="5" fill="#FFFDF8" stroke="#3B2620" stroke-width="3"/>' +
      '<g class="cherry"><path d="M118 20C117 28 115 34 113 40" stroke="#1F4D3A" stroke-width="2.5" fill="none" stroke-linecap="round"/><circle cx="112" cy="42" r="9" fill="#8C2155" stroke="#3B2620" stroke-width="2"/></g></svg>' +
      '<h1>Mixing your matches</h1><p><span id="cookline">Checking ' + plural(RATED_BARS.length, "bar") + "</span>…</p></div>";
  }
  V["bar/results"] = function () {
    var p = S.bar.profile; if (!p) return null;
    var per = PERSONA.bar(p), ranked = RATED_BARS.map(function (b) { return { b: b, m: vibe(b, p) }; }).sort(function (a, c) { return c.m.score - a.m.score; });
    return '<div class="pad"><div class="persona"><span class="big" aria-hidden="true">' + per[0] + '</span><span class="label">Your night-out personality</span><h1 style="font-size:28px">' + per[1] + '</h1><p class="sub">Your best matches for tonight.</p></div>' +
      ranked.slice(0, 3).map(function (x, i) { return barCard(x.b, i, x.m); }).join("") +
      (ranked.length > 3 ? '<span class="label">Also worth a try</span><ul class="list">' + ranked.slice(3, 8).map(function (x) { return '<li><a class="row" href="' + href(x.b) + '"><span class="n">' + icon(x.b) + "</span><span><b>" + esc(x.b.n) + "</b><small>" + esc(x.b.d) + " · " + esc(x.b.c) + (price(x.b) ? " · " + esc(price(x.b)) : "") + '</small></span><span class="score">' + x.m.score + "%</span></a></li>"; }).join("") + "</ul>" : "") +
      '<div class="chips"><a class="pill" href="#bar/quiz" data-retake="bar">Retake</a><a class="pill solid" href="#bar/spin">Still can’t decide? Spin the bottle 🍾</a></div></div>';
  };
  var HOT_BLURB = { "Central": "Lan Kwai Fong, SoHo and Wyndham Street, where most of the action is", "Sai Ying Pun": "Quieter neighbourhood bars", "Tsim Sha Tsui": "The Kowloon side", "Wan Chai": "Lockhart Road and around", "Sheung Wan": "Small bars off the main roads" };
  V["bar/hotspots"] = function () {
    var B = S.bar, list = BARS.filter(function (b) { return (B.kind === "all" || (B.kind === "bar" ? b.kind !== "Club" : b.kind !== "Bar")) && (B.budget >= 200 || b.pp == null || b.pp <= B.budget); });
    var ds = districtsOf(BARS); if (ds.indexOf(B.pin) === -1) B.pin = ds[0];
    var here = list.filter(function (b) { return b.d === B.pin; }).sort(function (a, c) { return (c.rt || 0) - (a.rt || 0); });
    return '<div class="pad"><h1 class="app-title">Where to tonight?</h1>' +
      '<div class="seg"><button data-barkind="all" aria-pressed="' + (B.kind === "all") + '">All</button><button data-barkind="bar" aria-pressed="' + (B.kind === "bar") + '">🍸 Bars</button><button data-barkind="club" aria-pressed="' + (B.kind === "club") + '">🪩 Clubs</button></div>' +
      '<div class="slider"><div class="h-row"><label for="barbudget" class="meta">Price per drink</label><b id="barbudget-lbl">' + (B.budget >= 200 ? "Any price" : "Up to HK$" + B.budget) + '</b></div><input id="barbudget" type="range" min="80" max="200" step="10" value="' + B.budget + '"></div>' +
      '<span class="label">Hotspots</span><div class="hots">' + ds.map(function (d) {
        var inD = list.filter(function (b) { return b.d === d; }), bars = inD.filter(function (b) { return b.kind !== "Club"; }).length, clubs = inD.filter(function (b) { return b.kind !== "Bar"; }).length;
        var top = inD.filter(function (b) { return b.rt != null; }).sort(function (a, c) { return c.rt - a.rt; })[0];
        return '<button class="hot" data-hot="' + esc(d) + '" aria-pressed="' + (B.pin === d) + '"' + (inD.length ? "" : ' style="opacity:.45"') + "><b>" + esc(d) + '</b><span class="cnts">' + (bars ? '<span class="chip">🍸 ' + bars + "</span>" : "") + (clubs ? '<span class="chip pink">🪩 ' + clubs + "</span>" : "") + "</span><small>" + esc(HOT_BLURB[d] || "") + (top ? (HOT_BLURB[d] ? " · " : "") + "Putri’s top pick: " + esc(top.n) + " ★ " + top.rt : "") + "</small></button>";
      }).join("") + "</div>" +
      '<div class="sheet"><div class="h-row"><h2 style="font-size:22px">' + esc(B.pin) + '</h2><span class="meta">' + plural(here.length, "place") + "</span></div>" + (here.length ? placeRows(here) : '<p class="sub">Nothing here with these filters.</p>') + "</div></div>";
  };
  V["bar/spin"] = function () {
    var B = S.bar, pick = B.spinPick && find(B.spinPick), keys = contenders("bar");
    return '<div class="pad"><h1 class="app-title">Spin the Bottle</h1><p class="sub">Every bar and club Putri has reviewed in the area you pick sits around the circle. Spin the bottle and go where it points.</p>' +
      '<span class="label">Where are you heading?</span>' + locChips("bar") +
      '<div class="seg"><button data-barkind="all" aria-pressed="' + (B.kind === "all") + '">All</button><button data-barkind="bar" aria-pressed="' + (B.kind === "bar") + '">🍸 Bars</button><button data-barkind="club" aria-pressed="' + (B.kind === "club") + '">🪩 Clubs</button></div>' +
      wheel("bar", keys, B) +
      '<button class="cta cta-main spin-btn" data-spin="bar" style="justify-self:center;width:auto;padding:12px 32px">Spin! 🍾</button>' +
      (pick ? '<div class="result">' + barCard(pick, 0, null) + "</div>" : "") + "</div>";
  };

  // Sip & Bite
  V.sip = function () {
    var lines = ["Coffee, food, drinks. Planned in a few taps.", "Tell us when you’re heading out, we’ll do the rest.", "Brunch, lunch, dinner, dessert. Sorted.", ALL.length + " places, all tried by Putri."];
    return '<div class="landing">' + DOODLE + floaties([["8%", "12%", 0, "☕"], ["84%", "9%", 1.2, "🍝"], ["10%", "78%", 2.1, "🍰"], ["86%", "70%", .6, "🍸"], ["50%", "92%", 3, "🗺️"]]) +
      '<div class="bubble">Coffee, food or drinks? Why not all three.</div><div class="duo">' + cup("") + dumpling("") + coupe("") + "</div>" +
      '<div><h1 class="l-title" style="font-size:52px">Sip &amp;<br>Bite</h1><span class="stamp">by Putri</span></div>' +
      '<p class="tagline" id="tagline">' + esc(lines[S.day.tagline % lines.length]) + "</p>" +
      '<a class="cta cta-main" href="#sip/plans">What are your plans today? ✨</a><a class="cta cta-ghost" href="#sip/days">Pick a ready-made day</a>' +
      '<a class="back" style="justify-self:center;position:relative" href="#near">📍 What’s near me?</a></div>';
  };
  V["sip/plans"] = function () { startQuiz("day"); return quizView("day"); };
  V["sip/suggest"] = function () {
    var D = S.day, p = D.profile; if (!p) return null;
    var slots = planResults(), got = slots.filter(function (s) { return s.pick; });
    var head = { morning: ["🌅", "Your morning out"], lunch: ["🌞", "Your lunchtime out"], evening: ["🌙", "Your evening out"] }[p.time];
    return '<div class="pad"><div class="suggest-head"><span class="big" aria-hidden="true">' + head[0] + '</span><span class="label">Putri suggests</span><h1 style="font-size:26px">' + head[1] + (p.area !== "any" ? " in " + esc(p.area) : "") + "</h1>" +
      '<p class="sub">' + (p.need === "unsure" ? "You weren’t sure, so here’s what Putri would do at this time of day." : "Matched to your plans, the time and where you’ll be.") + "</p></div>" +
      (p.time === "evening" && p.need === "coffee" ? '<div class="banner"><span aria-hidden="true" style="font-size:22px">⏰</span><span><b>Lots of HK cafés close by 6–7pm</b><small>Check opening hours before you go</small></span></div>' : "") +
      slots.map(function (s, i) {
        if (!s.pick) return '<div class="card"><span class="slot-when">' + esc(s.when) + '</span><p class="sub">Nothing nearby yet.</p></div>';
        var x = s.pick.x, m = s.pick.m;
        return '<article class="card"><div class="slot-when"><span>' + (i + 1) + ". " + esc(s.when) + "</span>" + (s.more ? '<button class="pill" data-pswap="' + i + '" aria-label="Show another option">↻ Another</button>' : "") + "</div>" +
          '<div class="card-head" style="grid-template-columns:minmax(0,1fr) auto"><div><h3><a href="' + href(x) + '" style="text-decoration:none">' + icon(x) + " " + esc(x.n) + '</a></h3><span class="meta">' + esc(s.pick.spot && s.pick.spot.branch ? s.pick.spot.branch.label + " branch" : x.d) + (x.c ? " · " + esc(x.c) : "") + (x.rt != null ? " · ★ " + x.rt : "") + (price(x) ? " · " + esc(price(x)) : "") + '</span></div><span class="match">' + m.score + "%</span></div>" +
          (s.pick.spot && s.pick.spot.branch ? '<p class="meta" style="margin:0">Putri reviewed the ' + esc(x.d) + ' branch. <a href="' + esc(branchUrl(s.pick.spot.branch)) + '" target="_blank" rel="noopener">Directions to this one</a></p>' : "") +
          (x.o ? '<p class="order">' + (x.type === "cafe" ? "Get" : "Order") + ": <b>" + esc(x.o) + "</b></p>" : "") +
          (x.no ? '<p class="note">“' + esc(x.no) + "”</p>" : "") +
          '<div class="chips">' + m.why.map(function (w) { return '<span class="chip ' + w[0] + '">' + esc(w[1]) + "</span>"; }).join("") + "</div></article>";
      }).join("") +
      '<div class="chips">' + (got.length ? '<button class="pill solid" data-addall="' + esc(got.map(function (s) { return s.pick.x.key; }).join(",")) + '">＋ Add ' + (got.length > 1 ? "all " + got.length : "it") + " to My day</button>" : "") + '<a class="pill" href="#sip/plans" data-retake="day">Change plans</a></div></div>';
  };
  V["sip/days"] = function () {
    var D = S.day, stops = planStops(), got = stops.filter(function (s) { return s.x; }), areas = districtsOf(FOOD).filter(function (d) { return CAFES.some(function (c) { return c.d === d; }); });
    if (areas.indexOf(D.area) === -1) D.area = areas[0];
    return '<div class="pad"><h1 class="app-title">Ready-made days</h1><p class="sub">Pick a kind of day and an area. Putri fills in the stops; tap ↻ to swap any of them.</p>' +
      '<span class="label">What kind of day?</span><div class="seg">' + Object.keys(PLANS).map(function (k) { return '<button data-plan="' + k + '" aria-pressed="' + (D.plan === k) + '">' + PLANS[k].name + "</button>"; }).join("") + "</div>" +
      '<span class="label">Where?</span><div class="chips">' + areas.map(function (d) { return '<button class="pill" data-area="' + esc(d) + '" aria-pressed="' + (D.area === d) + '">' + esc(d) + "</button>"; }).join("") + "</div>" +
      '<div class="timeline">' + stops.map(function (s, i) {
        var prev = i && stops[i - 1].spot, ico = { cafe: "☕", food: "🍽️", bar: "🍸", club: "🪩", dessert: "🍰" }[s.kind];
        return '<div class="stop"><span class="ico ' + (s.kind === "club" || s.kind === "bar" ? "bar" : s.kind === "dessert" ? "food" : s.kind) + '" aria-hidden="true">' + ico + '</span><div style="min-width:0"><span class="when">' + esc(s.when) + (prev && s.x ? " · " + walk(kmPts(prev.ll, s.spot.ll)) + " from the last stop" : "") + "</span>" +
          (s.x ? '<div class="box"><div class="h-row"><a class="name" href="' + href(s.x) + '" style="font-weight:700;text-decoration:none">' + esc(s.x.n) + "</a>" + (s.options > 1 ? '<button class="pill" data-swap="' + i + '" aria-label="Swap this stop">↻</button>' : "") + "</div>" +
            '<span class="meta">' + esc(s.spot && s.spot.branch ? s.spot.branch.label + " branch (Putri reviewed " + s.x.d + ")" : s.x.d) + (s.x.rt != null ? " · ★ " + s.x.rt : "") + (s.x.o ? " · get " + esc(s.x.o) : "") + "</span></div>" : '<div class="box"><span class="meta">Nothing nearby yet.</span></div>') + "</div></div>";
      }).join("") + "</div>" +
      (got.length ? '<button class="pill solid" style="padding:10px" data-addall="' + esc(got.map(function (s) { return s.x.key; }).join(",")) + '">＋ Add this day to My day (then rearrange it)</button>' : "") + "</div>";
  };
  V["sip/map"] = function () {
    var D = S.day, L = D.layer, pool = ALL.filter(function (x) { return L === "both" || x.type === L || (L === "food" && x.type === "dessert"); }), ds = districtsOf(ALL);
    if (ds.indexOf(D.pin) === -1) D.pin = ds[0];
    var here = pool.filter(function (x) { return x.d === D.pin; }).sort(byRank);
    return '<div class="pad"><h1 class="app-title">One map</h1>' +
      '<div class="seg"><button data-layer="both" aria-pressed="' + (L === "both") + '">All</button><button data-layer="cafe" aria-pressed="' + (L === "cafe") + '">☕ Coffee</button><button data-layer="food" aria-pressed="' + (L === "food") + '">🍽️ Food</button><button data-layer="bar" aria-pressed="' + (L === "bar") + '">🍸 Bars</button></div>' +
      mtr(ds, { pin: D.pin, note: "lilac cafés · yellow food · berry bars", size: function (d) { return pool.filter(function (x) { return x.d === d; }).length; },
        dim: function (d) { return !pool.some(function (x) { return x.d === d; }); },
        badges: function (d) { var b = [], c = CAFES.filter(function (x) { return x.d === d; }).length, f = FOOD.filter(function (x) { return x.d === d; }).length + DESSERTS.filter(function (x) { return x.d === d; }).length, r = RATED_BARS.filter(function (x) { return x.d === d; }).length;
          if ((L === "both" || L === "cafe") && c) b.push(["cafe", c]); if ((L === "both" || L === "food") && f) b.push(["food", f]); if ((L === "both" || L === "bar") && r) b.push(["bar", r]); return b; } }) +
      '<div class="sheet"><div class="h-row"><h2 style="font-size:22px">' + esc(D.pin) + '</h2><span class="meta">' + plural(here.length, "place") + "</span></div>" + placeRows(here) + "</div></div>";
  };

  // Near me (uses the phone's location if allowed, otherwise a district you pick)
  V.near = function () {
    var N = S.near, pt = N.at || CENTRE[N.district];
    var groups = {};
    ALL.filter(function (x) { return (N.type === "both" || x.type === N.type || (N.type === "food" && x.type === "dessert")) && (x.rt == null || x.rt >= 3.9); }).forEach(function (x) {
      var s = nearestSpot(x, pt), g = x.type + "|" + slug(x.n), own = kmPts(pt, where(x));
      // Places Putri reviewed twice (e.g. two NOCs) show once, with the review closest to you.
      if (!groups[g] || s.k < groups[g].k - 1e-6 || (Math.abs(s.k - groups[g].k) < 1e-6 && own < groups[g].own)) groups[g] = { x: x, k: s.k, spot: s, own: own };
    });
    var pool = Object.keys(groups).map(function (g) { return groups[g]; }).sort(function (a, b) { return a.k - b.k || (b.x.rt || 0) - (a.x.rt || 0); }).slice(0, 12);
    return '<div class="pad"><h1 class="app-title">What’s near me?</h1>' +
      '<button class="pill solid" data-locate="1" style="justify-self:start">' + (N.locating ? "Finding you…" : N.at ? "📍 Using your location · refresh" : "📍 Use my location") + "</button>" +
      '<p class="sub">' + (N.at ? "Closest good places to where you are now." : "Or pick where you are:") + "</p>" +
      '<div class="chips">' + districtsOf(ALL).filter(function (d) { return CENTRE[d]; }).map(function (d) { return '<button class="pill" data-near="' + esc(d) + '" aria-pressed="' + (!N.at && N.district === d) + '">' + esc(d) + "</button>"; }).join("") + "</div>" +
      '<div class="seg"><button data-neartype="both" aria-pressed="' + (N.type === "both") + '">All</button><button data-neartype="cafe" aria-pressed="' + (N.type === "cafe") + '">☕ Coffee</button><button data-neartype="food" aria-pressed="' + (N.type === "food") + '">🍽️ Food</button><button data-neartype="bar" aria-pressed="' + (N.type === "bar") + '">🍸 Bars</button></div>' +
      '<ul class="list">' + pool.map(function (o) { return '<li><a class="row" href="' + href(o.x) + '"><span class="n">' + icon(o.x) + "</span><span><b>" + esc(o.x.n) + "</b><small>" + esc(o.spot.branch ? spotNote(o.x, o.spot) : o.x.d + (o.x.rt != null ? " · ★ " + o.x.rt : "")) + '</small></span><span class="score">' + walk(o.k) + "</span></a></li>"; }).join("") + "</ul></div>";
  };

  // Place page (same for cafés, restaurants, bars and dessert spots)
  V.place = function (x) {
    function near(list, n) {
      var seen = {};
      return list.filter(function (y) { return y !== x && y.rt != null && y.rt >= 4; }).map(function (y) { var s = nearestSpot(y, where(x)); return { y: y, k: s.k, spot: s }; })
        .sort(function (a, b) { return a.k - b.k || b.y.rt - a.y.rt; }).filter(function (o) { var g = o.y.type + slug(o.y.n); if (seen[g]) return false; seen[g] = 1; return true; }).slice(0, n);
    }
    var sections = x.type === "food" ? [["🍰 Dessert after?", dessertsNear(x, 3)], ["☕ Coffee after?", near(CAFES, 3)], ["🍸 Drinks after?", near(RATED_BARS, 2)]]
      : x.type === "bar" ? [["🍽️ Dinner before?", near(FOOD, 3)]]
      : x.type === "dessert" ? [["🍽️ Eat first?", near(FOOD, 3)], ["☕ Coffee nearby?", near(CAFES, 2)]]
      : [["🍽️ Food nearby?", near(FOOD, 3)], ["🍰 Something sweet?", dessertsNear(x, 2)]];
    function pairList(pairs) { return '<ul class="list">' + pairs.map(function (o) { return '<li><a class="row" href="' + href(o.y) + '"><span class="n">' + icon(o.y) + "</span><span><b>" + esc(o.y.n) + "</b><small>" + esc(o.spot && o.spot.branch ? spotNote(o.y, o.spot) : o.y.d + (o.y.rt != null ? " · ★ " + o.y.rt : "") + (o.y.o ? " · " + o.y.o : "")) + '</small></span><span class="score">' + walk(o.k) + "</span></a></li>"; }).join("") + "</ul>"; }
    var others = branchesOf(x), from = S.near.at || where(x);
    var twins = ALL.filter(function (y) { return y !== x && y.type === x.type && slug(y.n) === slug(x.n); });
    var branchHtml = others.length ? '<span class="label">📍 Other branches (' + others.length + ")</span>" +
      '<p class="sub" style="margin-top:-6px">Putri reviewed the ' + esc(x.d) + " branch; her rating is shown for all of them." + (S.near.at ? " Nearest to you first." : "") + "</p>" +
      '<ul class="list">' + others.map(function (b) { return { b: b, k: kmPts(from, b.ll), twin: twins.filter(function (y) { return kmPts(where(y), b.ll) < 0.15; })[0] }; }).sort(function (a, c) { return a.k - c.k; }).map(function (o, i) {
        var inner = '<span class="n">📍</span><span><b>' + esc(o.twin ? o.twin.d : o.b.label) + "</b><small>" + (o.twin ? "Putri reviewed this one too · ★ " + o.twin.rt : "★ " + x.rt + " (from the " + esc(x.d) + " branch)") + " · " + esc(o.b.addr.split(",").slice(0, 2).join(",")) + '</small></span><span class="score">' + walk(o.k) + "</span>";
        return '<li' + (i >= 6 ? ' class="more-branch" hidden' : "") + ">" + (o.twin ? '<a class="row" href="' + href(o.twin) + '">' : '<a class="row" href="' + esc(branchUrl(o.b)) + '" target="_blank" rel="noopener">') + inner + "</a></li>";
      }).join("") + "</ul>" + (others.length > 6 ? '<button class="small-link" data-morebranches="1">Show all ' + others.length + " branches</button>" : "") : "";
    var word = { cafe: "café", food: "restaurant", bar: x.kind === "Club" ? "club" : "bar", dessert: "dessert spot" }[x.type];
    return '<div class="pad">' +
      '<div class="card">' + (x.rk && x.rk <= 3 ? '<span class="label" style="margin:0">Putri’s #' + x.rk + " in " + esc(x.d) + "</span>" : "") +
      '<h1 class="app-title">' + esc(x.n) + '</h1><p class="sub">' + esc(x.d) + (x.type !== "cafe" && x.c ? " · " + esc(x.c) : "") + (x.area ? " · " + esc(x.area) : "") + "</p>" +
      '<div class="stats4"><div class="stat"><b>' + (x.rt != null ? "★ " + x.rt : "–") + '</b><small>Putri’s rating' + (branchesOf(x).length ? " · " + (branchesOf(x).length + 1) + " branches" : "") + '</small></div><div class="stat"><b>' + esc(price(x) || "–") + "</b><small>" + (x.type === "food" ? "per person" : x.type === "bar" ? "per drink" : "price") + "</small></div></div></div>" +
      (x.o ? '<div class="banner"><span aria-hidden="true" style="font-size:24px">' + (x.type === "food" ? "🥢" : x.type === "bar" ? "🍸" : x.type === "dessert" ? "🍰" : "☕") + "</span><span><b>" + (x.type === "food" ? "Order this" : x.type === "bar" ? "Drink this" : "Get this") + "</b><small>" + esc(x.o) + "</small></span></div>" : "") +
      (x.dessert ? '<div class="banner"><span aria-hidden="true" style="font-size:24px">🍰</span><span><b>Stay for dessert</b><small>' + esc(x.dessert) + "</small></span></div>" : "") +
      (x.no ? '<p class="note" style="font-size:16px">“' + esc(x.no) + "”</p>" : "") + tagChips(x) + tipCards(x) +
      '<div class="chips">' + addBtn(x) + saveBtn(x) + '<a class="pill" href="' + esc(mapsUrl(x)) + '" target="_blank" rel="noopener">📍 Maps</a><button class="pill" data-share="1">Share</button></div>' +
      voteBlock(x) + branchHtml +
      sections.filter(function (s) { return s[1].length; }).map(function (s) { return '<span class="label">' + s[0] + "</span>" + pairList(s[1]); }).join("") +
      '<button class="small-link" data-closed="' + esc(x.key) + '">Has this ' + word + " closed? Let Putri know</button></div>";
  };

  V.putri = function () {
    var count = {}; FOOD.forEach(function (r) { if (r.c) count[r.c] = (count[r.c] || 0) + 1; });
    var favC = Object.keys(count).sort(function (a, b) { return count[b] - count[a]; })[0] || "–";
    var dk = {}; CAFES.forEach(function (c) { if (c.k && c.k !== "Other") dk[c.k] = (dk[c.k] || 0) + 1; });
    var favD = Object.keys(dk).sort(function (a, b) { return dk[b] - dk[a]; })[0] || "–";
    var fives = ALL.filter(function (x) { return x.rt === 5; });
    var topBar = RATED_BARS.slice().sort(function (a, b) { return b.rt - a.rt; })[0];
    var perfect = districtsOf(ALL).map(function (d) {
      var c = CAFES.filter(function (x) { return x.d === d; }).sort(byRank)[0], f = FOOD.filter(function (x) { return x.d === d; }).sort(byRank)[0];
      return c && f && c.rt >= 4.5 && f.rt >= 4.5 ? { d: d, c: c, f: f } : null;
    }).filter(Boolean);
    return '<div class="pad"><div class="hero-p"><div class="duo">' + cup("") + dumpling("") + '</div><div><span class="label" style="margin:0">Putri, all of it</span><h1 style="font-family:var(--f-title);font-size:24px;line-height:1">Eats, sips and opinions</h1><p>Every place that’s still open, in one spot</p></div></div>' +
      '<div class="stats4"><div class="stat"><b>' + ALL.length + '</b><small>places tried</small></div><div class="stat"><b>' + districtsOf(ALL).length + '</b><small>districts explored</small></div>' +
      '<div class="stat"><b>' + esc(favC) + '</b><small>her most-eaten cuisine</small></div><div class="stat"><b>' + esc(favD) + "</b><small>her most-ordered drink</small></div></div>" +
      (topBar ? '<div class="stat"><b>' + RATED_BARS.length + ' <span style="font-size:16px">bars &amp; clubs</span></b><small>top pick: ' + esc(topBar.n) + "</small></div>" : "") +
      (perfect.length ? '<span class="label">Perfect-day districts</span><p class="sub" style="margin-top:-6px">Where Putri’s top café and top restaurant are both 4.5★ or better.</p><ul class="list">' + perfect.map(function (p) { return '<li><a class="row" href="' + href(p.f) + '"><span class="n">✨</span><span><b>' + esc(p.d) + "</b><small>☕ " + esc(p.c.n) + " + 🍽️ " + esc(p.f.n) + "</small></span><span></span></a></li>"; }).join("") + "</ul>" : "") +
      (function () {
        var rows = S.recent.map(function (v) { return { v: v, x: find((v.kind || "cafe") + "/" + slug(v.district) + "/" + slug(v.cafe)) }; }).filter(function (o) { return o.x; }).slice(0, 8);
        return rows.length ? '<span class="label">Putri vs her friends: latest votes</span><ul class="list">' + rows.map(function (o) { return '<li><a class="row" href="' + href(o.x) + '"><span class="n">' + (o.v.verdict === "agree" ? "👍" : "👎") + "</span><span><b>" + esc(o.x.n) + "</b><small>Someone " + (o.v.verdict === "agree" ? "agrees" : "disagrees") + " with Putri’s ★ " + o.x.rt + '</small></span><span class="score">' + ago(o.v.time) + "</span></a></li>"; }).join("") + "</ul>" : "";
      })() +
      '<span class="label">The 5★ club (' + fives.length + ')</span><div class="chips">' + fives.map(function (x) { return '<a class="pill" href="' + href(x) + '">' + icon(x) + " " + esc(x.n) + "</a>"; }).join("") + "</div></div>";
  };

  // Which branch each My day stop uses: the one nearest the stop before (the first uses your location, if known).
  function daySpots(list) {
    var out = [], prev = S.near.at || null;
    list.forEach(function (x, i) { var s = i === 0 && !prev ? { ll: where(x), branch: null, k: 0 } : nearestSpot(x, prev); out.push(s); prev = s.ll; });
    return out;
  }
  function stopQuery(x, s) { return s && s.branch ? s.branch.n + ", " + s.branch.addr : q(x); }
  function dayRouteUrl(list, spots) {
    if (!list.length) return "";
    if (list.length === 1) return spots[0].branch ? branchUrl(spots[0].branch) : mapsUrl(list[0]);
    var qs = list.map(function (x, i) { return stopQuery(x, spots[i]); });
    return "https://www.google.com/maps/dir/?api=1&travelmode=walking&origin=" + encodeURIComponent(qs[0]) + "&destination=" + encodeURIComponent(qs[qs.length - 1]) +
      (qs.length > 2 ? "&waypoints=" + encodeURIComponent(qs.slice(1, -1).join("|")) : "");
  }
  V.myday = function () {
    var list = S.myday.map(find).filter(Boolean), total = 0, spots = daySpots(list);
    for (var i = 1; i < list.length; i++) total += kmPts(spots[i - 1].ll, spots[i].ll);
    var qq = S.mq.trim().toLowerCase(), last = list[list.length - 1];
    var picks = qq ? ALL.filter(function (x) { return !inDay(x.key) && [x.n, x.d, x.c || "", x.o].join(" ").toLowerCase().indexOf(qq) !== -1; }).sort(byRank).slice(0, 6)
      : last ? ALL.filter(function (x) { return !inDay(x.key) && x.rt >= 4.3; }).map(function (x) { return { x: x, k: distTo(x, spots[spots.length - 1].ll) }; }).sort(function (a, b) { return a.k - b.k; }).slice(0, 4).map(function (o) { return o.x; })
      : ALL.filter(function (x) { return x.rt === 5; }).slice(0, 4);
    return '<div class="pad"><div class="myday-head"><span class="md-ico" aria-hidden="true">📋</span><div><h1 class="app-title">My day</h1><p class="sub">One list for all of Out &amp; About, kept on this phone.</p></div></div>' +
      '<div class="md-strip" aria-hidden="true"><span>☕ Bean There</span><span>🍽️ Seconds, Please</span><span>🍸 Pour Decisions</span><span>✨ Sip &amp; Bite</span></div>' +
      (list.length ? '<ol class="day-list">' + list.map(function (x, j) {
        return (j ? '<li class="day-gap" aria-hidden="true">🚶 ' + walk(kmPts(spots[j - 1].ll, spots[j].ll)) + "</li>" : "") +
          '<li class="day-item"><span class="num ' + (x.type === "dessert" ? "food" : x.type) + '">' + (j + 1) + '</span><span style="min-width:0"><a class="nm" href="' + href(x) + '" style="text-decoration:none">' + icon(x) + " " + esc(x.n) + "</a><small>" + esc(spots[j].branch ? spots[j].branch.label + " branch" : x.d) + (x.o ? " · " + esc(x.o) : "") + "</small></span>" +
          '<span class="ctrl"><button data-up="' + j + '" aria-label="Move ' + esc(x.n) + ' up"' + (j ? "" : " disabled") + '>↑</button><button data-down="' + j + '" aria-label="Move ' + esc(x.n) + ' down"' + (j < list.length - 1 ? "" : " disabled") + '>↓</button><button data-rm="' + j + '" aria-label="Remove ' + esc(x.n) + '">✕</button></span></li>';
      }).join("") + "</ol>" +
        '<p class="meta" style="margin:0">' + plural(list.length, "stop") + (list.length > 1 ? " · about " + total.toFixed(1) + " km of walking" : "") + "</p>" +
        '<div class="chips">' + (list.length > 2 ? '<button class="pill" data-optimise="1">✨ Suggest an order</button>' : "") + '<a class="pill solid" href="' + esc(dayRouteUrl(list, spots)) + '" target="_blank" rel="noopener">🚶 Open in Google Maps</a><button class="pill" data-shareday="1">Share</button><button class="pill" data-clear="1">Clear</button></div>'
        : '<div class="empty">Nothing here yet. Tap <b>＋ My day</b> on any café, restaurant or bar, or add a whole plan from Sip &amp; Bite.</div>') +
      (list.length >= 8 ? '<p class="sub">That’s 8 stops, the most Google Maps can route at once.</p>' :
        '<span class="label">Add a stop</span><label class="search"><span aria-hidden="true">🔎</span><input id="mq" type="search" placeholder="Search any café, restaurant or bar…" value="' + esc(S.mq) + '" autocomplete="off" aria-label="Search places to add"></label>' +
        (qq ? "" : '<p class="meta" style="margin:-6px 0 0">' + (last ? "Good places near " + esc(last.n) + ":" : "Some of Putri’s 5★ places:") + "</p>") +
        '<ul class="list">' + picks.map(function (x) { return '<li><button class="row" data-add="' + esc(x.key) + '"><span class="n">' + icon(x) + "</span><span><b>" + esc(x.n) + "</b><small>" + esc(x.d) + (x.rt != null ? " · ★ " + x.rt : "") + (last && !qq ? " · " + walk(distTo(x, spots[spots.length - 1].ll)) : "") + '</small></span><span class="score">＋</span></button></li>'; }).join("") + "</ul>") + "</div>";
  };

  function saveBtn(x) { var on = S.saved.indexOf(x.key) !== -1; return '<button class="pill" data-save="' + esc(x.key) + '" aria-pressed="' + on + '">' + (on ? "♥ Saved" : "♡ Save") + "</button>"; }
  function restoreLink() {
    var data = { v: 1, saved: S.saved, myday: S.myday, pf: S.food.profile, pb: S.bar.profile, pc: S.bean.profile };
    return location.origin + location.pathname + "#restore/" + encodeURIComponent(JSON.stringify(data));
  }
  V.saved = function () {
    var list = S.saved.map(find).filter(Boolean);
    return '<div class="pad"><h1 class="app-title">♡ Saved</h1><p class="sub">Places you want to remember. Kept on this phone, no login.</p>' +
      (list.length ? '<ul class="list">' + list.map(function (x) { return '<li><a class="row" href="' + href(x) + '"><span class="n">' + icon(x) + "</span><span><b>" + esc(x.n) + "</b><small>" + esc(x.d + (x.o ? " · " + x.o : "")) + '</small></span><span class="score">' + (x.rt != null ? "★ " + x.rt : "") + "</span></a></li>"; }).join("") + "</ul>" +
        '<div class="chips"><button class="pill solid" data-addall="' + esc(list.slice(0, 8).map(function (x) { return x.key; }).join(",")) + '">＋ Add to My day</button></div>'
        : '<div class="empty">Nothing saved yet. Tap <b>♡ Save</b> on any place.</div>') +
      '<span class="label">Your stuff on another phone</span><p class="sub" style="margin-top:-6px">Your saved places, My day and quiz results live on this phone. To move or back them up, send yourself this link and open it on the other device.</p>' +
      '<div class="chips"><button class="pill" data-restorelink="1">📲 Get my link</button></div></div>';
  };
  V.sweet = function () {
    var ds = districtsOf(DESSERTS);
    return '<div class="pad"><h1 class="app-title">🍰 Sweet tooth</h1><p class="sub">Putri always needs a sweet treat after a meal. These are her dessert spots.</p>' +
      (ds.length ? ds.map(function (d) {
        var here = DESSERTS.filter(function (x) { return x.d === d; }).sort(byRank);
        return '<span class="label">' + esc(d) + "</span>" + placeRows(here);
      }).join("") : '<div class="empty">Desserts are on their way.</div>') + "</div>";
  };
  // A plan someone shared with you (#plan/…)
  V.sharedplan = function () {
    var list = (S.shared || []).map(find).filter(Boolean), total = 0;
    for (var i = 1; i < list.length; i++) total += km(list[i - 1], list[i]);
    return '<div class="pad"><h1 class="app-title">A day out, shared with you</h1><p class="sub">' + plural(list.length, "stop") + (list.length > 1 ? " · about " + total.toFixed(1) + " km of walking" : "") + "</p>" +
      (list.length ? '<ul class="list">' + list.map(function (x, j) { return '<li><a class="row" href="' + href(x) + '"><span class="n">' + (j + 1) + "</span><span><b>" + icon(x) + " " + esc(x.n) + "</b><small>" + esc(x.d + (x.o ? " · " + x.o : "")) + '</small></span><span class="score">' + (x.rt != null ? "★ " + x.rt : "") + "</span></a></li>"; }).join("") + "</ul>" +
        '<div class="chips"><button class="pill solid" data-useplan="1">Use this as My day</button><a class="pill" href="' + esc(routeUrl(list)) + '" target="_blank" rel="noopener">🚶 Open in Google Maps</a></div>'
        : '<div class="empty">This plan is empty, or its places have closed.</div>') + "</div>";
  };
  V.note = function () {
    var k = S.noteKind;
    var kinds = [["food", "🍽️ A restaurant"], ["bar", "🍸 A bar or club"], ["dessert", "🍰 A dessert spot"], ["cafe", "☕ A café"], ["idea", "💡 An idea or bug"], ["hi", "👋 Just saying hi"]];
    var place = ["food", "bar", "dessert", "cafe"].indexOf(k) !== -1;
    return '<div class="pad"><h1 class="app-title">Send Putri a note</h1><p class="sub">Notes are anonymous. Putri reads every one.</p>' +
      '<span class="label">What’s it about?</span><div class="chips">' + kinds.map(function (o) { return '<button class="pill" data-notekind="' + o[0] + '" aria-pressed="' + (k === o[0]) + '">' + o[1] + "</button>"; }).join("") + "</div>" +
      '<form id="note-form" class="card" style="gap:12px">' +
      (place ? '<div class="field"><label for="n-name">Name of the place</label><input id="n-name" required maxlength="80" autocomplete="off"></div><div class="field"><label for="n-district">District (optional)</label><input id="n-district" maxlength="80" autocomplete="off"></div>' : "") +
      '<div class="field"><label for="n-msg">' + (place ? "Why should Putri try it? (optional)" : "Your message") + '</label><textarea id="n-msg" maxlength="600"' + (place ? "" : " required") + "></textarea></div>" +
      '<input class="trap" id="n-web" tabindex="-1" autocomplete="off" aria-hidden="true">' +
      '<button class="cta cta-main" type="submit">' + (API ? "Send" : "Notes open soon") + "</button></form></div>";
  };

  // ---------- Router ----------
  var MODULE_OF = { home: "hub", near: "hub", putri: "hub", myday: "hub", note: "hub", saved: "hub", sweet: "hub", sharedplan: "hub" };
  var THEME = { hub: "hub", bean: "bean", food: "food", bar: "bar", sip: "day" };
  var NAVS = {
    hub: [["", "🏠", "Home"], ["near", "📍", "Near me"], ["putri", "🌷", "Putri"], ["myday", "📋", "My day"]],
    bean: [["", "⌂", "Home"], ["bean/map", "🗺️", "Map"], ["bean/results", "☕", "Match"], ["myday", "📋", "My day"]],
    food: [["", "⌂", "Home"], ["food/map", "🗺️", "Map"], ["food/results", "😋", "Craving"], ["food/spin", "🥢", "Spin"], ["myday", "📋", "My day"]],
    bar: [["", "⌂", "Home"], ["bar/hotspots", "📍", "Hotspots"], ["bar/results", "🍸", "Vibe"], ["bar/spin", "🍾", "Spin"], ["myday", "📋", "My day"]],
    sip: [["", "⌂", "Home"], ["sip/suggest", "✨", "Plans"], ["sip/days", "🗓️", "Days"], ["sip/map", "🗺️", "Map"], ["myday", "📋", "My day"]]
  };
  var TITLES = { "": "Out & About by Putri", bean: "Bean There", "bean/map": "Café map", food: "Seconds, Please", "food/quiz": "Craving Match", "food/results": "Your matches", "food/map": "Restaurant map", "food/lunch": "Lunch Set Finder", "food/spin": "Spin the Chopsticks", bar: "Pour Decisions", "bar/quiz": "Vibe Match", "bar/results": "Your matches", "bar/hotspots": "Hotspots", "bar/spin": "Spin the Bottle", sip: "Sip & Bite", "sip/plans": "Plans", "sip/suggest": "Putri suggests", "sip/days": "Ready-made days", "sip/map": "One map", near: "Near me", putri: "Putri’s page", myday: "My day", note: "Send Putri a note", saved: "Saved", sweet: "Sweet tooth", sharedplan: "A shared day out", "bean/quiz": "Taste Match", "bean/results": "Your matches" };
  var lastModule = "hub";

  function current() {
    var h = decodeURIComponent(location.hash.replace(/^#\/?/, ""));
    if (h.indexOf("p/") === 0) {
      var x = find(h.slice(2));
      return x ? { name: "place", x: x, module: { cafe: "bean", food: "food", dessert: "food", bar: "bar" }[x.type] } : { name: "gone", module: "hub" };
    }
    if (h.indexOf("plan/") === 0) { S.shared = h.slice(5).split(",").filter(String); return { name: "sharedplan", module: "hub", path: "sharedplan" }; }
    if (h.indexOf("restore/") === 0 || h.indexOf("import/") === 0) return { name: "incoming", module: "hub", raw: h };
    if (h === "sharedplan" || !V[h === "" ? "home" : h]) return { name: "home", module: "hub", path: "" };
    var mod = MODULE_OF[h || "home"] || h.split("/")[0];
    return { name: h || "home", module: mod, path: h };
  }
  // Back: the previous screen if you got here inside the app, otherwise the screen above this one
  // (so a shared link or the installed app, which has no browser back button, still has somewhere to go).
  var trail = [location.hash || "#"], replacing = false;
  function parentHash() {
    var r = current();
    if (r.name === "place") return "#" + ({ bean: "bean/map", food: "food/map", bar: "bar/hotspots" }[r.module] || "");
    if (r.path && r.path.indexOf("/") !== -1) return "#" + r.path.split("/")[0];
    return "#";
  }
  function goBack() {
    if (trail.length > 1) { history.back(); return; }
    var up = parentHash(); replacing = true; trail = [up]; location.replace(up);
  }
  // Links that bring things in: #restore/… (your own stuff from another phone) and #import/… (a saved list from the old Bean There site).
  function takeIncoming(raw) {
    var msg = "";
    try {
      if (raw.indexOf("restore/") === 0) {
        var d = JSON.parse(raw.slice(8)), n = 0;
        (d.saved || []).forEach(function (k) { if (BYKEY[k] && S.saved.indexOf(k) === -1) { S.saved.push(k); n++; } });
        if (!S.myday.length && d.myday) { S.myday = d.myday.filter(function (k) { return BYKEY[k]; }).slice(0, 8); saveDay(); }
        if (d.pf && !S.food.profile) { S.food.profile = d.pf; save("oa-food-profile", d.pf); }
        if (d.pb && !S.bar.profile) { S.bar.profile = d.pb; save("oa-bar-profile", d.pb); }
        if (d.pc && !S.bean.profile) { S.bean.profile = d.pc; save("oa-bean-profile", d.pc); }
        msg = "Your places are on this phone now ✓";
      } else {
        var m = 0;
        raw.slice(7).split(".").forEach(function (pair) { var k = "cafe/" + pair.replace("~", "/"); if (BYKEY[k] && S.saved.indexOf(k) === -1) { S.saved.push(k); m++; } });
        msg = m ? plural(m, "café") + " from your Bean There list saved ✓" : "Welcome to Out & About";
      }
      save("oa-saved", S.saved);
    } catch (e) { msg = "That link didn’t work. Ask for a new one."; }
    location.replace("#saved"); setTimeout(function () { toast(msg); }, 150);
  }
  var lastKey = "";
  function render(keep) {
    var r = current(), y = window.scrollY, html;
    if (r.name === "incoming") { takeIncoming(r.raw); return; }
    if (r.name === "gone") { location.replace("#"); setTimeout(function () { toast("That place has closed or moved, so it’s no longer on Out & About."); }, 60); return; }
    if (r.name === "place") html = V.place(r.x);
    else html = V[r.name === "home" ? "home" : r.name]();
    if (html == null) { // results without a quiz yet
      location.replace({ "food/results": "#food/quiz", "bar/results": "#bar/quiz", "bean/results": "#bean/quiz", "sip/suggest": "#sip/plans" }[r.name] || "#"); return;
    }
    var key = r.name + (r.x ? r.x.key : "");
    if (key !== lastKey) keep = false;
    lastKey = key;
    if (r.module !== "hub" || r.name === "home") lastModule = r.module;
    var theme = r.name === "myday" ? "hub" : THEME[r.module] || "hub";
    document.body.className = "theme-" + theme;
    app.innerHTML = html;
    if (["bean", "food", "bar", "sip"].indexOf(r.name) !== -1) app.insertAdjacentHTML("afterbegin", '<a class="land-back" href="#">← Home</a>');
    var bare = ["bean", "food", "bar", "sip", "food/quiz", "bar/quiz", "sip/plans", "bean/quiz"].indexOf(r.name) !== -1;
    topbar.hidden = r.name === "home" || bare;
    navEl.hidden = bare;
    app.className = bare ? "no-nav" : "";
    var navKey = r.name === "place" ? null : r.path;
    var navMod = r.name === "myday" ? (lastModule === "hub" ? "hub" : lastModule) : r.module;
    navEl.innerHTML = NAVS[navMod].map(function (n) {
      var on = navKey === n[0] || (n[0] === "" && r.name === "home");
      return '<a href="#' + n[0] + '"' + (on ? ' aria-current="page"' : "") + (n[0] === "myday" ? ' class="md-nav"' : "") + '><span aria-hidden="true">' + n[1] + (n[0] === "myday" && S.myday.length ? '<i class="badge">' + S.myday.length + "</i>" : "") + "</span>" + n[2] + "</a>";
    }).join("");
    document.title = r.name === "place" ? r.x.n + " · Out & About by Putri" : (r.name === "home" ? "" : (TITLES[r.path] || "") + " · ") + "Out & About by Putri";
    window.scrollTo(0, keep ? y : 0);
  }
  window.addEventListener("hashchange", function () { clearTimers(); S.cooking = null; render(); });
  window.addEventListener("hashchange", function () {
    var h = location.hash || "#";
    if (replacing) { replacing = false; return; }
    if (trail.length > 1 && trail[trail.length - 2] === h) trail.pop(); else trail.push(h);
  });

  function finishQuiz() {
    var st = S.quiz, kind = st.kind;
    if (kind === "food") { S.food.profile = st.draft; save("oa-food-profile", st.draft); }
    if (kind === "bar") { S.bar.profile = st.draft; save("oa-bar-profile", st.draft); }
    if (kind === "cafe") { S.bean.profile = st.draft; save("oa-bean-profile", st.draft); }
    if (kind === "day") { S.day.profile = st.draft; S.day.pswaps = {}; save("oa-day-profile", st.draft); }
    S.quiz = null;
    if (kind === "day") { location.hash = "#sip/suggest"; return; }
    S.cooking = kind; render();
    var lines = kind === "food" ? ["Reading Putri’s reviews", "Counting your budget", "Plating up"] : kind === "cafe" ? ["Reading Putri’s notes", "Checking the beans", "Pouring"] : ["Reading Putri’s reviews", "Checking the dance floors", "Adding a cherry on top"];
    lines.forEach(function (l, i) { timers.push(setTimeout(function () { var el = document.getElementById("cookline"); if (el) el.textContent = l; }, (i + 1) * 550)); });
    timers.push(setTimeout(function () { S.cooking = null; location.hash = kind === "food" ? "#food/results" : kind === "cafe" ? "#bean/results" : "#bar/results"; }, reduceMotion ? 300 : 2300));
  }

  // ---------- Events ----------
  function shareLink(title, text, url) {
    if (navigator.share) { navigator.share({ title: title, text: text, url: url }).catch(function () {}); return; }
    if (navigator.clipboard) navigator.clipboard.writeText(text + " " + url).then(function () { toast("Link copied ✓"); }, function () { toast(url); });
    else toast(url);
  }
  document.addEventListener("click", function (e) {
    var pin = e.target.closest && e.target.closest("[data-pin]");
    if (pin) { var r0 = current(), mod = r0.name === "bean/map" ? "bean" : r0.name === "food/map" ? "food" : "day"; S[mod].pin = pin.getAttribute("data-pin"); render(true); return; }
    var a = e.target.closest("a[data-retake]");
    if (a) { S.quiz = null; return; }
    var t = e.target.closest("button"); if (!t) return;
    var d = t.dataset;
    if (d.back) { goBack(); return; }
    if (d.qback) { if (S.quiz && S.quiz.step) { S.quiz.step--; render(); } else { S.quiz = null; location.hash = "#" + (current().module === "sip" ? "sip" : current().module); } return; }
    if (d.answer) {
      if (t.classList.contains("picked") || !S.quiz) return; t.classList.add("picked");
      var QZ = QUIZZES[S.quiz.kind]; S.quiz.draft[QZ[S.quiz.step].key] = d.answer;
      setTimeout(function () { if (!S.quiz) return; if (S.quiz.step < QZ.length - 1) { S.quiz.step++; render(); } else finishQuiz(); }, 220);
      return;
    }
    if (d.add) {
      var i = S.myday.indexOf(d.add);
      if (i !== -1) { S.myday.splice(i, 1); toast("Removed from My day"); }
      else if (S.myday.length >= 8) toast("My day is full (8 stops)");
      else { S.myday.push(d.add); toast("Added to My day ✓ · " + plural(S.myday.length, "stop")); if (current().name === "myday") S.mq = ""; }
      saveDay(); render(true); return;
    }
    if (d.addall) { var n = 0; d.addall.split(",").forEach(function (k) { if (!inDay(k) && S.myday.length < 8) { S.myday.push(k); n++; } }); saveDay(); toast(n ? "Added " + n + " to My day ✓" : "Already in My day"); render(true); return; }
    if (d.up) { var u = +d.up; S.myday.splice(u - 1, 0, S.myday.splice(u, 1)[0]); saveDay(); render(true); return; }
    if (d.down) { var w = +d.down; S.myday.splice(w + 1, 0, S.myday.splice(w, 1)[0]); saveDay(); render(true); return; }
    if (d.rm) { S.myday.splice(+d.rm, 1); saveDay(); render(true); return; }
    if (d.clear) { if (confirm("Clear My day?")) { S.myday = []; saveDay(); render(true); } return; }
    if (d.optimise) {
      var list = S.myday.map(find).filter(Boolean), out = [list.shift()];
      var at = daySpots([out[0]])[0].ll;
      while (list.length) { var bi = 0; list.forEach(function (x, j) { if (distTo(x, at) < distTo(list[bi], at)) bi = j; }); var nx = list.splice(bi, 1)[0]; at = nearestSpot(nx, at).ll; out.push(nx); }
      S.myday = out.map(function (x) { return x.key; }); saveDay(); toast("Shortest walking order ✓"); render(true); return;
    }
    if (d.shareday) { var l = S.myday.map(find).filter(Boolean); shareLink("A day out", "A day out, planned with Out & About by Putri: " + l.map(function (x) { return x.n; }).join(" → ") + ". Open it here:", location.origin + location.pathname + "#plan/" + l.map(function (x) { return x.key; }).join(",")); return; }
    if (d.share) { var x0 = current().x; if (x0) shareLink(x0.n, x0.n + " (" + x0.d + "), recommended by Putri on Out & About", location.href); return; }
    if (d.lunch) { S.food.lunch = !S.food.lunch; render(true); return; }
    if (d.spinloc) { S[current().module].spinLoc = d.spinloc; render(true); return; }
    if (d.spin) { spin(d.spin); return; }
    if (d.barkind) { S.bar.kind = d.barkind; render(true); return; }
    if (d.hot) { S.bar.pin = d.hot; render(true); return; }
    if (d.pswap) { S.day.pswaps[d.pswap] = (S.day.pswaps[d.pswap] || 0) + 1; render(true); return; }
    if (d.area) { S.day.area = d.area; S.day.swaps = {}; render(true); return; }
    if (d.plan) { S.day.plan = d.plan; S.day.swaps = {}; render(true); return; }
    if (d.swap) { S.day.swaps[d.swap] = (S.day.swaps[d.swap] || 0) + 1; render(true); return; }
    if (d.layer) { S.day.layer = d.layer; render(true); return; }
    if (d.near) { S.near.district = d.near; S.near.at = null; render(true); return; }
    if (d.neartype) { S.near.type = d.neartype; render(true); return; }
    if (d.locate) {
      if (!navigator.geolocation) { toast("Your browser can’t share its location. Pick a district instead."); return; }
      S.near.locating = true; render(true);
      navigator.geolocation.getCurrentPosition(function (pos) { S.near.locating = false; S.near.at = [pos.coords.latitude, pos.coords.longitude]; render(true); },
        function () { S.near.locating = false; toast("Couldn’t get your location. Pick a district instead."); render(true); }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 120000 });
      return;
    }
    if (d.save) { var si = S.saved.indexOf(d.save); if (si === -1) { S.saved.push(d.save); toast("Saved ♥"); } else { S.saved.splice(si, 1); toast("Removed from Saved"); } save("oa-saved", S.saved); render(true); return; }
    if (d.dismiss) { save(d.dismiss, true); render(true); return; }
    if (d.restorelink) { shareLink("My Out & About", "My Out & About places:", restoreLink()); return; }
    if (d.useplan) { if (S.myday.length && !confirm("Replace your current My day with this plan?")) return; S.myday = (S.shared || []).filter(function (k) { return BYKEY[k]; }).slice(0, 8); saveDay(); location.hash = "#myday"; return; }
    if (d.notekind) { S.noteKind = d.notekind; render(true); return; }
    if (d.morebranches) { app.querySelectorAll(".more-branch").forEach(function (li) { li.hidden = false; }); t.remove(); return; }
    if (d.vote) {
      var px = find(d.key); if (!px) return;
      if (!API) { toast("Votes open soon."); return; }
      var vk = voteKey(px), was = S.myVotes[vk], verdict = was === d.vote ? "none" : d.vote;
      S.myVotes[vk] = verdict === "none" ? undefined : verdict; save("oa-myvotes", S.myVotes); render(true);
      apiPost({ action: "vote", kind: px.type, district: px.d, name: px.n, verdict: verdict }).then(function (res) {
        if (res && res.ok) { S.votes[vk] = res.votes; render(true); } else toast((res && res.error) || "Couldn’t save your vote.");
      }).catch(function () { toast("Couldn’t save your vote. Are you online?"); });
      return;
    }
    if (d.closed) {
      var cx = find(d.closed); if (!cx) return;
      if (!API) { toast("Thanks! Reports open soon."); return; }
      if (!confirm("Let Putri know " + cx.n + " may have closed?")) return;
      apiPost({ action: "feedback", type: "closed", cafe: cx.n, district: cx.d, message: cx.type }).then(function (res) {
        toast(res && res.ok ? "Thanks! Putri will check." : (res && res.error) || "Couldn’t send it.");
      }).catch(function () { toast("Couldn’t send it. Are you online?"); });
      return;
    }
  });
  document.addEventListener("submit", function (e) {
    if (e.target.id !== "note-form") return;
    e.preventDefault();
    if (!API) { toast("Notes open soon."); return; }
    var nm = document.getElementById("n-name"), ds = document.getElementById("n-district"), msg = document.getElementById("n-msg");
    var body = { action: "feedback", type: S.noteKind, cafe: nm ? nm.value : "", district: ds ? ds.value : "", message: msg.value, website: document.getElementById("n-web").value };
    var btn = e.target.querySelector("button[type=submit]"); btn.disabled = true; btn.textContent = "Sending…";
    apiPost(body).then(function (res) {
      if (res && res.ok) { toast("Sent! Thank you 💌"); e.target.reset(); } else toast((res && res.error) || "Couldn’t send it.");
    }).catch(function () { toast("Couldn’t send it. Are you online?"); }).then(function () { btn.disabled = false; btn.textContent = "Send"; });
  });
  document.addEventListener("keydown", function (e) {
    var pin = e.target.closest && e.target.closest("[data-pin]");
    if (pin && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); pin.click(); }
  });
  function keepFocus(id) { var el = document.getElementById(id), pos = el.selectionStart; render(true); var n = document.getElementById(id); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (err) {} } }
  document.addEventListener("input", function (e) {
    if (e.target.id === "budget") { S.food.budget = +e.target.value; var lbl = document.getElementById("budget-lbl"); if (lbl) lbl.textContent = current().name === "food/lunch" ? "Up to HK$" + e.target.value : budgetLabel(+e.target.value); }
    if (e.target.id === "barbudget") { S.bar.budget = +e.target.value; var bl = document.getElementById("barbudget-lbl"); if (bl) bl.textContent = +e.target.value >= 200 ? "Any price" : "Up to HK$" + e.target.value; }
    if (e.target.id === "fq") { S.food.query = e.target.value; keepFocus("fq"); }
    if (e.target.id === "hq") { S.hq = e.target.value; keepFocus("hq"); }
    if (e.target.id === "mq") { S.mq = e.target.value; keepFocus("mq"); }
  });
  document.addEventListener("change", function (e) { if (e.target.id === "budget" || e.target.id === "barbudget") render(true); });
  document.getElementById("back-btn").addEventListener("click", goBack);
  document.getElementById("share-btn").addEventListener("click", function () { shareLink(document.title, "Putri’s honest picks around Hong Kong: cafés, restaurants, bars and more.", location.href); });
  setInterval(function () {
    var r = current(), st = { food: S.food, bar: S.bar, sip: S.day }[r.name];
    if (!st) return; st.tagline++;
    var el = document.getElementById("tagline"); if (!el) return;
    var lines = r.name === "food" ? FOOD_LINES() : null;
    if (lines) el.textContent = lines[st.tagline % lines.length]; else render(true);
  }, 4000);

  // ---------- Start ----------
  Promise.all([
    loadTab(CFG.cafesCsvUrl, "data/cafes.csv"), loadTab(CFG.foodCsvUrl, "data/food.csv"),
    loadTab(CFG.barsCsvUrl, "data/bars.csv"), loadTab(CFG.dessertCsvUrl, "data/desserts.csv"),
    loadTab(CFG.branchesCsvUrl, "data/branches.csv")
  ]).then(function (res) {
    buildData(res[0], res[1], res[2], res[3], res[4]);
    var before = S.myday.length;
    S.myday = S.myday.filter(function (k) { return BYKEY[k]; });
    if (S.myday.length !== before) { saveDay(); setTimeout(function () { toast("A place in My day has closed, so it was removed."); }, 400); }
    render();
    refreshVotes();
    if (!navigator.onLine) toast("You’re offline. Showing the lists saved on this phone.");
  }).catch(function (err) {
    console.error(err);
    app.innerHTML = '<p class="status">Couldn’t load Putri’s lists. Please try again in a bit.</p>';
  });
  if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(function () {});
})();
