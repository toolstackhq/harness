"use strict";

function createRecorderScript(options = {}) {
  const bindingName = options.bindingName ?? "__scriptGenRecord";
  const debounceMs = Number(options.debounceMs ?? 350);
  const captureSensitive = Boolean(options.captureSensitive);

  return `(() => {
    const BINDING = ${JSON.stringify(bindingName)};
    const DEBOUNCE_MS = ${JSON.stringify(debounceMs)};
    const CAPTURE_SENSITIVE = ${JSON.stringify(captureSensitive)};
    if (window.__scriptGenRecorderInstalled) return;
    window.__scriptGenRecorderInstalled = true;
    globalThis.__scriptGenRecorderQueue = globalThis.__scriptGenRecorderQueue || [];

    const send = (payload) => {
      try {
        const fn = globalThis[BINDING];
        if (typeof fn === "function") {
          fn(JSON.stringify(payload));
          return;
        }
        globalThis.__scriptGenRecorderQueue.push(payload);
      } catch (_) {
      }
    };

    const normalize = (value) => String(value ?? "").replace(/\\s+/g, " ").trim();
    const cssEscape = (value) => {
      if (window.CSS && typeof window.CSS.escape === "function") return window.CSS.escape(value);
      return String(value).replace(/[^a-zA-Z0-9_-]/g, (char) => '\\\\' + char.codePointAt(0).toString(16) + ' ');
    };

    const labelText = (el) => {
      if (!el) return "";
      const labelledBy = el.getAttribute && el.getAttribute("aria-labelledby");
      if (labelledBy) {
        const ids = labelledBy.split(/\\s+/).filter(Boolean);
        const text = ids.map((id) => document.getElementById(id)?.textContent || "").join(" ");
        if (text) return normalize(text);
      }
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
        if (el.id) {
          const explicit = document.querySelector(\`label[for="\${cssEscape(el.id)}"]\`);
          if (explicit) return normalize(explicit.textContent);
        }
        const wrap = el.closest("label");
        if (wrap) return normalize(wrap.textContent);
      }
      return "";
    };

    const inferRole = (el) => {
      if (!el) return "";
      const tag = el.tagName.toLowerCase();
      const type = (el.getAttribute("type") || "").toLowerCase();
      const role = (el.getAttribute("role") || "").toLowerCase();
      if (role) return role;
      if (tag === "button") return "button";
      if (tag === "a" && el.hasAttribute("href")) return "link";
      if (tag === "input") {
        if (["button", "submit", "reset"].includes(type)) return "button";
        if (type === "checkbox") return "checkbox";
        if (type === "radio") return "radio";
        if (["email", "password", "search", "tel", "text", "url", "number"].includes(type)) return "textbox";
      }
      if (tag === "textarea") return "textbox";
      if (tag === "select") return "combobox";
      if (el.isContentEditable) return "textbox";
      return "";
    };

    const siblingsIndex = (el) => {
      if (!el || !el.parentElement) return 1;
      const sibs = Array.from(el.parentElement.children).filter((node) => node.tagName === el.tagName);
      return sibs.indexOf(el) + 1;
    };

    const buildCssForHost = (host) => {
      if (!host) return "";
      const testId = host.getAttribute && host.getAttribute("data-testid");
      const id = host.id || "";
      const tag = host.tagName.toLowerCase();
      if (testId) return \`[data-testid="\${testId.replace(/"/g, '\\"')}"]\`;
      if (id) return \`#\${cssEscape(id)}\`;
      return tag;
    };

    const shadowChain = (el) => {
      const chain = [];
      let node = el;
      while (node) {
        const root = node.getRootNode && node.getRootNode();
        if (root && root.host) {
          chain.unshift(buildCssForHost(root.host));
          node = root.host;
        } else {
          break;
        }
      }
      return chain;
    };

    const buildCss = (el) => {
      const testId = el.getAttribute && el.getAttribute("data-testid");
      const cy = el.getAttribute && el.getAttribute("data-cy");
      const pw = el.getAttribute && el.getAttribute("data-pw");
      const id = el.id || "";
      const name = el.getAttribute && el.getAttribute("name");
      const aria = el.getAttribute && el.getAttribute("aria-label");
      const placeholder = el.getAttribute && el.getAttribute("placeholder");
      if (testId) return \`[data-testid="\${testId.replace(/"/g, '\\"')}"]\`;
      if (cy) return \`[data-cy="\${cy.replace(/"/g, '\\"')}"]\`;
      if (pw) return \`[data-pw="\${pw.replace(/"/g, '\\"')}"]\`;
      if (id) return \`#\${cssEscape(id)}\`;
      if (name) return \`[name="\${name.replace(/"/g, '\\"')}"]\`;
      if (aria) return \`[aria-label="\${aria.replace(/"/g, '\\"')}"]\`;
      if (placeholder) return \`\${el.tagName.toLowerCase()}[placeholder="\${placeholder.replace(/"/g, '\\"')}"]\`;
      const index = siblingsIndex(el);
      return \`\${el.tagName.toLowerCase()}:nth-of-type(\${index})\`;
    };

    const xpathLiteral = (value) => {
      const text = String(value);
      if (!text.includes("'")) return "'" + text + "'";
      if (!text.includes('"')) return '"' + text + '"';
      const parts = text.split("'").map((part) => "'" + part + "'");
      return "concat(" + parts.join(", " + JSON.stringify("'") + ", ") + ")";
    };

    const buildXpath = (el) => {
      const tag = el.tagName.toLowerCase();
      const testId = el.getAttribute && el.getAttribute("data-testid");
      const id = el.id || "";
      const name = el.getAttribute && el.getAttribute("name");
      const aria = el.getAttribute && el.getAttribute("aria-label");
      const placeholder = el.getAttribute && el.getAttribute("placeholder");
      const text = normalize(el.textContent || "");
      if (id) return \`//*[@id=\${xpathLiteral(id)}]\`;
      if (testId) return \`//*[@data-testid=\${xpathLiteral(testId)}]\`;
      if (name) return \`//*[@name=\${xpathLiteral(name)}]\`;
      if (aria) return \`//*[@aria-label=\${xpathLiteral(aria)}]\`;
      if (placeholder) return \`//\${tag}[@placeholder=\${xpathLiteral(placeholder)}]\`;
      if (text) return \`//\${tag}[normalize-space()=\${xpathLiteral(text)}]\`;
      return \`//\${tag}\`;
    };

    const ambiguityCount = (el, css) => {
      try {
        const root = (el.getRootNode && el.getRootNode()) || document;
        return root.querySelectorAll(css).length;
      } catch (_) {
        return 0;
      }
    };

    const buildSnapshot = (el) => {
      const tag = el.tagName.toLowerCase();
      const type = (el.getAttribute("type") || "").toLowerCase();
      const text = normalize(el.textContent || el.innerText || "");
      const label = labelText(el);
      const role = inferRole(el);
      const dataTestId = el.getAttribute && (el.getAttribute("data-testid") || el.getAttribute("data-test-id") || el.getAttribute("data-cy") || el.getAttribute("data-pw")) || "";
      const password = tag === "input" && type === "password";
      const value = "value" in el ? String(el.value ?? "") : "";
      const css = buildCss(el);
      const chain = shadowChain(el);
      const matched = ambiguityCount(el, css);
      let rect = null;
      try {
        const r = el.getBoundingClientRect && el.getBoundingClientRect();
        if (r) rect = { x: r.left, y: r.top, width: r.width, height: r.height };
      } catch (_) {}
      const viewport = {
        width: window.innerWidth,
        height: window.innerHeight,
        devicePixelRatio: window.devicePixelRatio || 1
      };
      return {
        tag,
        type,
        role,
        text: text.slice(0, 120),
        label,
        id: el.id || "",
        name: (el.getAttribute && el.getAttribute("name")) || "",
        ariaLabel: (el.getAttribute && el.getAttribute("aria-label")) || "",
        placeholder: (el.getAttribute && el.getAttribute("placeholder")) || "",
        dataTestId,
        href: (el.getAttribute && el.getAttribute("href")) || "",
        value: password && !CAPTURE_SENSITIVE ? "[redacted]" : value,
        checked: "checked" in el ? Boolean(el.checked) : false,
        selected: "selected" in el ? Boolean(el.selected) : false,
        contenteditable: Boolean(el.isContentEditable),
        css,
        xpath: buildXpath(el),
        shadowChain: chain,
        matchedCount: matched,
        rect,
        viewport
      };
    };

    const isEditable = (el) => {
      if (!el) return false;
      const tag = el.tagName.toLowerCase();
      return tag === "input" || tag === "textarea" || tag === "select" || el.isContentEditable;
    };

    const activeTarget = (node) => {
      if (!node || !(node instanceof Element)) return null;
      return node.closest("button,a[href],input,textarea,select,[role='button'],[role='link'],[contenteditable='true'],label,[data-testid],[data-test-id],[data-cy],[data-pw]") || node;
    };

    const emit = (kind, el, extra = {}) => {
      if (!el || !(el instanceof Element)) return;
      const snapshot = buildSnapshot(el);
      send({
        kind,
        url: location.href,
        title: document.title,
        ts: Date.now(),
        element: snapshot,
        ...extra
      });
    };

    const pending = new WeakMap();

    const scheduleFill = (el) => {
      clearTimeout(pending.get(el));
      const timer = setTimeout(() => {
        emit("fill", el, { value: buildSnapshot(el).value });
        pending.delete(el);
      }, DEBOUNCE_MS);
      pending.set(el, timer);
    };

    document.addEventListener("click", (event) => {
      const path = typeof event.composedPath === "function" ? event.composedPath() : [event.target];
      const deepest = path.find((n) => n instanceof Element);
      const el = activeTarget(deepest || event.target);
      if (!el) return;
      const snapshot = buildSnapshot(el);
      if (snapshot.role === "textbox" || snapshot.tag === "input" || snapshot.tag === "textarea") return;
      emit("click", el);
    }, true);

    document.addEventListener("input", (event) => {
      const path = typeof event.composedPath === "function" ? event.composedPath() : [event.target];
      const deepest = path.find((n) => n instanceof Element);
      const el = activeTarget(deepest || event.target);
      if (!el || !isEditable(el)) return;
      scheduleFill(el);
    }, true);

    document.addEventListener("change", (event) => {
      const path = typeof event.composedPath === "function" ? event.composedPath() : [event.target];
      const deepest = path.find((n) => n instanceof Element);
      const el = activeTarget(deepest || event.target);
      if (!el) return;
      const snapshot = buildSnapshot(el);
      if (snapshot.tag === "select") {
        emit("select", el, { value: snapshot.value });
        return;
      }
      if (snapshot.type === "checkbox" || snapshot.type === "radio") {
        emit("check", el, { checked: snapshot.checked });
        return;
      }
      if (isEditable(el)) {
        emit("fill", el, { value: snapshot.value });
      }
    }, true);

    document.addEventListener("keydown", (event) => {
      const path = typeof event.composedPath === "function" ? event.composedPath() : [event.target];
      const deepest = path.find((n) => n instanceof Element);
      const el = activeTarget(deepest || event.target);
      if (!el) return;
      if (event.key === "Enter") {
        emit("press", el, { key: "Enter" });
      }
    }, true);

    document.addEventListener("submit", (event) => {
      const form = event.target instanceof HTMLFormElement ? event.target : null;
      if (!form) return;
      const target = form.querySelector("button[type=submit],input[type=submit],button:not([type]),[role='button']");
      if (target) {
        emit("submit", target);
      } else {
        send({
          kind: "submit",
          url: location.href,
          title: document.title,
          ts: Date.now(),
          element: buildSnapshot(form)
        });
      }
    }, true);

    const notifyNavigation = () => {
      // Only the top frame reports navigations. Ad / analytics iframes fire
      // their own pushState + load events and would flood the trace with
      // tracker URLs (demdex, doubleclick, etc.) that are not meaningful
      // user navigations and cannot be replayed from the top frame.
      if (window !== window.top) return;
      send({
        kind: "navigate",
        url: location.href,
        title: document.title,
        ts: Date.now()
      });
    };

    const wrapHistory = (method) => {
      const original = history[method];
      if (typeof original !== "function") return;
      history[method] = function(...args) {
        const result = original.apply(this, args);
        queueMicrotask(notifyNavigation);
        return result;
      };
    };

    wrapHistory("pushState");
    wrapHistory("replaceState");
    window.addEventListener("hashchange", notifyNavigation, true);
    window.addEventListener("popstate", notifyNavigation, true);
    notifyNavigation();
  })();`;
}

module.exports = { createRecorderScript };
