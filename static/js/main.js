import { buildSchema, suggest } from "./suggest.mjs";

(async function () {
  console.log("jq server");
  let oldquery = "";
  let olddata = "";
  const runfilter = async function (query, data) {
    const ans = await fetch("/jq", {
      method: "POST",
      body: JSON.stringify({
        query,
        data,
      }),
      headers: {
        "Content-Type": "application/json",
        Accpet: "text/plain",
      },
    });
    const re = await ans.json();
    console.log(re);
    return re;
  };
  const debounce = function (f, t) {
    let callT = Date.now();
    let tOut = null;
    return function (...args) {
      const now = Date.now();
      clearTimeout(tOut);
      const timediff = now - callT;
      if (timediff >= t) {
        f(...args);
        callT = Date.now();
      } else {
        tOut = setTimeout(function () {
          f(...args);
          callT = Date.now();
        }, t - timediff);
      }
    };
  };
  const jqQueryInput = document.querySelector("#jq-query");
  const jsonInput = document.querySelector("#json");
  const resultDom = document.querySelector("#result");
  const errorarea = document.querySelector("#error-area");
  const listDom = document.querySelector("#suggestions");
  let latestQuery = Math.random();
  const onChange = debounce(async function (ev) {
    const queryVal = jqQueryInput.value;
    const jsonValue = jsonInput.value;
    if (olddata !== jsonValue || oldquery !== queryVal) {
      olddata = jsonValue;
      oldquery = queryVal;
      const curQuery = Math.random();
      latestQuery = curQuery;
      const result = await runfilter(queryVal, jsonValue);
      if (curQuery === latestQuery) {
        resultDom.textContent = result.response;
        errorarea.textContent = JSON.stringify(result.error);
      } else {
        console.log("diff", curQuery, latestQuery);
      }
    }
  }, 500);

  /* ----------------------------------------------------------- completions */

  // Schema of the pasted document; rebuilt only when its text changes.
  let cacheText = null;
  let cacheSchema = null;
  const schemaFor = function (text) {
    if (text === cacheText) return cacheSchema;
    cacheText = text;
    try {
      cacheSchema = buildSchema(JSON.parse(text));
    } catch (e) {
      cacheSchema = null; // mid-paste, or not JSON at all
    }
    return cacheSchema;
  };

  // Accepted suggestions are the positive labels for phase 1's ranking model,
  // dismissals the negative ones. Bounded ring buffer, stays in the browser.
  const LOG_KEY = "jq-suggest-log";
  const record = function (entry) {
    try {
      const log = JSON.parse(localStorage.getItem(LOG_KEY) || "[]");
      log.push({ t: Date.now(), jsonBytes: jsonInput.value.length, ...entry });
      localStorage.setItem(LOG_KEY, JSON.stringify(log.slice(-500)));
    } catch (e) {
      /* storage unavailable: suggestions still work */
    }
  };

  let items = [];
  let active = -1;
  let cursorAt = 0;
  let context = "none";
  let dismissedFor = null;

  const close = function () {
    items = [];
    active = -1;
    listDom.hidden = true;
    listDom.replaceChildren();
  };

  const render = function () {
    listDom.replaceChildren();
    items.forEach(function (item, i) {
      const li = document.createElement("li");
      if (i === active) li.classList.add("active");
      const label = document.createElement("span");
      label.className = "label";
      label.textContent = item.label;
      const detail = document.createElement("span");
      detail.className = "detail";
      detail.textContent = item.detail;
      li.append(label, detail);
      // mousedown, not click: the input must keep focus while picking
      li.addEventListener("mousedown", function (ev) {
        ev.preventDefault();
        accept(i);
      });
      listDom.append(li);
    });
    listDom.hidden = items.length === 0;
  };

  const refresh = function () {
    const query = jqQueryInput.value;
    cursorAt =
      jqQueryInput.selectionStart === null ? query.length : jqQueryInput.selectionStart;
    if (dismissedFor === query) return;
    const schema = schemaFor(jsonInput.value);
    const res = schema
      ? suggest(query, cursorAt, schema)
      : { items: [], context: "nojson" };
    items = res.items;
    context = res.context;
    active = items.length ? 0 : -1;
    render();
  };

  const accept = function (i) {
    const item = items[i];
    if (!item) return;
    const query = jqQueryInput.value;
    const before = query.slice(0, item.insertFrom);
    const after = query.slice(cursorAt);
    record({
      kind: "accept",
      context: context,
      query: query,
      cursor: cursorAt,
      chosen: item.insertText,
      shown: items.map(function (it) { return it.label; }),
    });
    jqQueryInput.value = before + item.insertText + after;
    const pos = before.length + item.insertText.length;
    jqQueryInput.setSelectionRange(pos, pos);
    dismissedFor = null;
    onChange();
    refresh(); // immediately offer the next level
  };

  const NAV_KEYS = { ArrowDown: 1, ArrowUp: 1, Escape: 1 };

  jqQueryInput.addEventListener("keydown", function (ev) {
    if (!items.length) return;
    if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
      ev.preventDefault();
      const step = ev.key === "ArrowDown" ? 1 : items.length - 1;
      active = (active + step) % items.length;
      render();
      return;
    }
    if (ev.key === "Tab" || ev.key === "Enter") {
      ev.preventDefault();
      accept(active);
      return;
    }
    if (ev.key === "Escape") {
      ev.preventDefault();
      dismissedFor = jqQueryInput.value;
      record({
        kind: "reject",
        context: context,
        query: jqQueryInput.value,
        cursor: cursorAt,
        shown: items.map(function (it) { return it.label; }),
      });
      close();
    }
  });

  // 'input' fires for typing, paste, autofill and IME; keyup is what re-runs the filter.
  jqQueryInput.addEventListener("input", refresh);
  jqQueryInput.addEventListener("keyup", function (ev) {
    if (NAV_KEYS[ev.key]) return;
    onChange();
  });
  jqQueryInput.addEventListener("click", refresh);
  jqQueryInput.addEventListener("focus", refresh);
  jqQueryInput.addEventListener("blur", close);

  jsonInput.addEventListener("input", refresh);
  jsonInput.addEventListener("change", onChange);
  jsonInput.addEventListener("keyup", onChange);

  // Console hook: window.jqSuggest.log() dumps accepted / dismissed suggestions.
  window.jqSuggest = {
    log: function () {
      return JSON.parse(localStorage.getItem(LOG_KEY) || "[]");
    },
    clear: function () {
      localStorage.removeItem(LOG_KEY);
    },
    probe: function (q) {
      const schema = schemaFor(jsonInput.value);
      return schema ? suggest(q, q.length, schema) : null;
    },
  };
  /*
    '[{id: .[].id}]'

    [
      {
        "id": "1",
        "name": "n1"
      },
      {
        "id": "2",
        "name": "n1"
      },
      {
        "id": "3",
        "name": "n1"
      }
    ]
  */
})();
