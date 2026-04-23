# script-gen

Record interactions from a Chromium browser started with remote debugging enabled, then generate automation code from the trace.

## Install

```bash
npm install
```

## Record

```bash
script-gen record --port 9222 --out trace.json
```

This connects to `http://127.0.0.1:9222/json/version`, attaches to open page targets, injects a recorder, and logs:

- navigations
- clicks
- text fills
- checkbox / radio changes
- select changes
- Enter key presses

## Generate

```bash
script-gen generate --input trace.json --target playwright
script-gen generate --input trace.json --target cypress
script-gen generate --input trace.json --target selenium
script-gen generate --input trace.json --target abstract
```

## Examples

```bash
# Record and print Playwright code when stopped
script-gen record --port 9222 --target playwright

# Generate multiple outputs from one trace
script-gen generate --input trace.json --target playwright,cypress,selenium,abstract
```

## Notes

- The recorder uses a page-injected script, so it sees user actions inside the page, including iframes that receive the injected script.
- Password fields are redacted by default. Use `--capture-sensitive` if you want to preserve values in the trace.
- The generated locator strategy prefers stable attributes first: `data-testid`, `id`, `name`, `aria-label`, labels, placeholders, and then text or CSS/XPath fallbacks.
