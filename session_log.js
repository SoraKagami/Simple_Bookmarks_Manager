/**
 * Transient in-memory warning/error log for the current extension page session.
 *
 * This intentionally does not use chrome.storage.  The log is lost when the
 * manager/options page is reloaded or closed, which avoids persisting bookmark
 * metadata or user input in settings storage.
 */
const MAX_SESSION_LOG_RECORDS = 200;
const ORIGINAL_CONSOLE = Object.freeze({
  warn: console.warn.bind(console),
  error: console.error.bind(console)
});

let records = [];
const subscribers = new Set();

/** Convert console arguments into safe log text without throwing on circular values. */
function stringifyLogValue(value) {
  if (value instanceof Error) return value.stack || value.message || String(value);
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, (key, innerValue) => {
      if (innerValue instanceof Error) return innerValue.stack || innerValue.message || String(innerValue);
      if (typeof innerValue === "function") return `[Function ${innerValue.name || "anonymous"}]`;
      return innerValue;
    });
  } catch {
    return String(value);
  }
}

/** Append a bounded warning/error log record and notify observers. */
export function addSessionLogRecord(level, args, source = "SBM") {
  const record = {
    time: new Date().toISOString(),
    level,
    source,
    message: Array.from(args, stringifyLogValue).join(" ")
  };
  records.push(record);
  if (records.length > MAX_SESSION_LOG_RECORDS) records = records.slice(-MAX_SESSION_LOG_RECORDS);
  for (const subscriber of subscribers) {
    try { subscriber(record); } catch { /* Logging observers must never break app code. */ }
  }
}

/** Capture console warnings/errors into the transient diagnostics log while preserving console output. */
export function installConsoleCapture(source = "SBM") {
  if (globalThis.__SBM_CONSOLE_CAPTURE_INSTALLED__) return;
  globalThis.__SBM_CONSOLE_CAPTURE_INSTALLED__ = true;

  console.warn = (...args) => {
    ORIGINAL_CONSOLE.warn(...args);
    addSessionLogRecord("warn", args, source);
  };
  console.error = (...args) => {
    ORIGINAL_CONSOLE.error(...args);
    addSessionLogRecord("error", args, source);
  };
}

/** Return a defensive copy of current warning/error log records. */
export function getSessionLogRecords() {
  return records.slice();
}

/** Clear the transient warning/error log and notify subscribers. */
export function clearSessionLogRecords() {
  records = [];
  for (const subscriber of subscribers) {
    try { subscriber(null); } catch { /* Ignore observer errors. */ }
  }
}

/** Subscribe to warning/error log changes and return an unsubscribe callback. */
export function subscribeSessionLog(callback) {
  subscribers.add(callback);
  return () => subscribers.delete(callback);
}
