/* Browser-local drafts and append-only review snapshots. No network requests.
 * Import accepts this site's extended case2rl-clinician-review-0.1 schema only:
 * original fields + view_sha256 + explicit client visibility/audit fields.
 * Legacy server JSON without these bindings is deliberately not auto-migrated.
 * Storage is application-level history, not tamper-proof or shared archival.
 */
(function (global) {
  "use strict";
  const SCHEMA = "case2rl-clinician-review-0.1";
  const DRAFT_SCHEMA = "case2rl-browser-draft-1";
  const MAX_BYTES = 1024 * 1024;
  const VISIBILITY = ["model_identity_visible", "reference_visible", "model_identity_ever_revealed", "reference_ever_revealed"];
  const EVER = VISIBILITY.slice(2);
  const TURN_VERDICTS = ["", "acceptable", "questionable", "unsafe"];
  const ISSUES = ["unnecessary", "hallucination", "missed_clue", "timing", "unsafe", "cost"];
  const FINAL_ENUMS = {
    diagnosis_agreement: ["", "agree", "partial", "disagree"],
    penalty_agreement: ["", "agree", "missing", "overcalled"],
    overall_verdict: ["", "acceptable", "minor_revision", "major_revision", "unsafe", "indeterminate"],
  };
  const has = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
  const fail = message => { throw new Error(`Review: ${message}`); };
  const copy = value => JSON.parse(JSON.stringify(value));
  const bytes = value => new TextEncoder().encode(value).length;

  function object(value, label) {
    if (!value || typeof value !== "object" || Array.isArray(value) ||
        ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail(`${label} must be an object.`);
    return value;
  }
  function keys(value, allowed, label, required = []) {
    object(value, label);
    for (const key of Object.keys(value)) if (!allowed.includes(key)) fail(`${label}: unsupported field ${key}.`);
    for (const key of required) if (!has(value, key)) fail(`${label}: missing ${key}.`);
  }
  function string(value, label, limit, empty = true) {
    if (typeof value !== "string" || value.length > limit || (!empty && !value.trim())) fail(`Invalid ${label}.`);
    return value;
  }
  function enumValue(value, allowed, label) {
    if (!allowed.includes(value)) fail(`Invalid ${label}.`);
    return value;
  }
  function safeTree(value, depth = 0) {
    if (depth > 15) fail("JSON nesting is too deep.");
    if (value && typeof value === "object") {
      if (!Array.isArray(value)) object(value, "JSON value");
      for (const key of Object.keys(value)) {
        if (["__proto__", "prototype", "constructor"].includes(key)) fail("Unsafe JSON key.");
        safeTree(value[key], depth + 1);
      }
    } else if (!["string", "boolean", "number"].includes(typeof value) && value !== null) {
      fail("Non-JSON value.");
    } else if (typeof value === "number" && !Number.isFinite(value)) fail("Non-finite number.");
  }
  function parse(text) {
    if (typeof text !== "string" || bytes(text) > MAX_BYTES) fail("JSON exceeds the 1 MiB limit.");
    let result;
    try { result = JSON.parse(text); } catch (_) { fail("Invalid JSON."); }
    safeTree(result);
    return result;
  }
  function bounded(value) {
    safeTree(value);
    if (bytes(JSON.stringify(value)) > MAX_BYTES) fail("Review exceeds the 1 MiB limit.");
    return value;
  }
  function context(input) {
    object(input, "context");
    const ctx = {
      reviewer_id: string(input.reviewer_id, "reviewer ID", 120, false),
      run_id: string(input.run_id, "run ID", 1024, false),
      run_sha256: input.run_sha256,
      view_sha256: input.view_sha256,
    };
    if (ctx.reviewer_id !== ctx.reviewer_id.trim()) fail("Reviewer ID must be trimmed.");
    for (const name of ["run_sha256", "view_sha256"]) {
      if (typeof ctx[name] !== "string" || !/^[a-f0-9]{64}$/.test(ctx[name])) fail(`Invalid ${name}.`);
    }
    if (!Array.isArray(input.turn_ids) || !input.turn_ids.length || input.turn_ids.length > 1000) fail("Known turn IDs required.");
    ctx.turn_ids = input.turn_ids.map(id => {
      if (!(typeof id === "number" || typeof id === "string") || !/^[1-9]\d{0,5}$/.test(String(id))) fail("Invalid turn ID.");
      return String(id);
    });
    if (new Set(ctx.turn_ids).size !== ctx.turn_ids.length) fail("Duplicate turn IDs.");
    return ctx;
  }
  function visibility(input = {}, strict = false) {
    keys(input, VISIBILITY, "visibility", strict ? VISIBILITY : []);
    const out = {};
    for (const key of VISIBILITY) {
      const value = has(input, key) ? input[key] : false;
      if (typeof value !== "boolean") fail(`Invalid ${key}.`);
      out[key] = value;
    }
    if (strict && ((out.model_identity_visible && !out.model_identity_ever_revealed) ||
                   (out.reference_visible && !out.reference_ever_revealed))) fail("Inconsistent visibility history.");
    out.model_identity_ever_revealed ||= out.model_identity_visible;
    out.reference_ever_revealed ||= out.reference_visible;
    return out;
  }
  function review(ctx, input, strict = false) {
    bounded(input);
    keys(input, ["reviewer", "turn_reviews", "final_review", "visibility"], "draft",
      strict ? ["reviewer", "turn_reviews", "final_review", "visibility"] : []);
    const who = strict ? input.reviewer : input.reviewer || { id: ctx.reviewer_id, specialty: "" };
    keys(who, ["id", "specialty"], "reviewer", strict ? ["id", "specialty"] : ["id"]);
    if (who.id !== ctx.reviewer_id) fail("Reviewer does not match this session.");
    const out = {
      reviewer: { id: who.id, specialty: string(strict ? who.specialty : who.specialty ?? "", "specialty", 200) },
      turn_reviews: {}, final_review: {}, visibility: visibility(input.visibility || {}, strict),
    };
    const turns = strict ? input.turn_reviews : input.turn_reviews ?? {};
    object(turns, "turn reviews");
    for (const [id, item] of Object.entries(turns)) {
      if (!ctx.turn_ids.includes(id)) fail(`Unknown turn ${id}.`);
      keys(item, ["verdict", "issues", "notes"], `turn ${id}`, strict ? ["verdict", "issues", "notes"] : []);
      const issues = strict ? item.issues : item.issues ?? [];
      if (!Array.isArray(issues) || issues.length > ISSUES.length || new Set(issues).size !== issues.length) fail("Invalid issue list.");
      for (const issue of issues) enumValue(issue, ISSUES, "issue tag");
      out.turn_reviews[id] = {
        verdict: enumValue(strict ? item.verdict : item.verdict ?? "", TURN_VERDICTS, "turn verdict"),
        issues: [...issues], notes: string(strict ? item.notes : item.notes ?? "", "turn notes", 12000),
      };
    }
    const final = strict ? input.final_review : input.final_review ?? {};
    keys(final, [...Object.keys(FINAL_ENUMS), "notes"], "final review", strict ? [...Object.keys(FINAL_ENUMS), "notes"] : []);
    for (const [key, values] of Object.entries(FINAL_ENUMS)) out.final_review[key] = enumValue(strict ? final[key] : final[key] ?? "", values, key);
    out.final_review.notes = string(strict ? final.notes : final.notes ?? "", "final notes", 20000);
    return out;
  }
  function snapshot(ctx, value) {
    bounded(value);
    const fields = ["schema_version", "review_id", "run_id", "run_sha256", "view_sha256", "saved_at", "reviewer", "turn_reviews", "final_review", "client"];
    keys(value, fields, "snapshot", fields);
    if (value.schema_version !== SCHEMA) fail("Unsupported review schema.");
    if (typeof value.review_id !== "string" || !/^(?:[a-f0-9]{32}|[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12})$/i.test(value.review_id)) fail("Invalid review ID.");
    for (const key of ["run_id", "run_sha256", "view_sha256"]) if (value[key] !== ctx[key]) fail(`${key} does not match the selected data.`);
    if (typeof value.saved_at !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|\+00:00)$/.test(value.saved_at) || !Number.isFinite(Date.parse(value.saved_at))) fail("Invalid saved_at.");
    if (new Date(value.saved_at).toISOString().slice(0, 19) !== value.saved_at.slice(0, 19)) fail("Invalid saved_at calendar date.");
    keys(value.client, [...VISIBILITY, "audit_scope"], "client", [...VISIBILITY, "audit_scope"]);
    if (value.client.audit_scope !== "browser_ui_only") fail("Unsupported client audit scope.");
    const vis = Object.fromEntries(VISIBILITY.map(key => [key, value.client[key]]));
    const normalized = review(ctx, { reviewer: value.reviewer, turn_reviews: value.turn_reviews, final_review: value.final_review, visibility: vis }, true);
    return {
      schema_version: SCHEMA, review_id: value.review_id, run_id: value.run_id,
      run_sha256: value.run_sha256, view_sha256: value.view_sha256, saved_at: value.saved_at,
      reviewer: normalized.reviewer, turn_reviews: normalized.turn_reviews, final_review: normalized.final_review,
      client: { ...normalized.visibility, audit_scope: "browser_ui_only" },
    };
  }
  function canonical(value) {
    if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
    if (value && typeof value === "object") return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
    return JSON.stringify(value);
  }
  function newId() {
    if (!global.crypto?.randomUUID) fail("Secure UUID generation is unavailable.");
    return global.crypto.randomUUID();
  }
  function create(options = {}) {
    const prefix = options.prefix ?? "case2rl.review.v1.";
    string(prefix, "storage prefix", 200, false);
    // Access localStorage lazily: exporting an in-memory draft also works when
    // this browser denies storage access entirely.
    function storage() {
      try { return has(options, "storage") ? options.storage : global.localStorage; }
      catch (_) { fail("Browser storage is unavailable. Export JSON to keep this review."); }
    }
    function io(operation) {
      try { return operation(storage()); }
      catch (error) { throw new Error(`Review storage: ${error.message || "unavailable"}. Export JSON to keep unsaved work.`, { cause: error }); }
    }
    const group = ctx => `${prefix}${encodeURIComponent(JSON.stringify([ctx.reviewer_id, ctx.run_id, ctx.run_sha256, ctx.view_sha256]))}:`;
    const draftKey = ctx => `${group(ctx)}draft`;
    function readDraft(ctx) {
      const text = io(store => store.getItem(draftKey(ctx)));
      if (text === null) return null;
      const value = parse(text);
      const names = ["schema_version", "run_id", "run_sha256", "view_sha256", "updated_at", "draft"];
      keys(value, names, "stored draft", names);
      if (value.schema_version !== DRAFT_SCHEMA) fail("Unsupported stored draft schema.");
      for (const key of ["run_id", "run_sha256", "view_sha256"]) if (value[key] !== ctx[key]) fail("Stored draft context mismatch.");
      if (typeof value.updated_at !== "string" || !Number.isFinite(Date.parse(value.updated_at))) fail("Invalid draft date.");
      return { ...value, draft: review(ctx, value.draft, true) };
    }
    function list(ctx) {
      const texts = io(store => {
        const found = [];
        const start = `${group(ctx)}snapshot:`;
        for (let i = 0; i < store.length; i += 1) {
          const key = store.key(i);
          if (key?.startsWith(start)) {
            const text = store.getItem(key);
            if (text !== null) found.push(text);
          }
        }
        return found;
      });
      const byId = new Map();
      for (const text of texts) {
        const item = snapshot(ctx, parse(text));
        if (byId.has(item.review_id) && canonical(byId.get(item.review_id)) !== canonical(item)) fail("Conflicting saved review IDs; history cannot be resumed safely.");
        byId.set(item.review_id, item);
      }
      return [...byId.values()].sort((a, b) => Date.parse(b.saved_at) - Date.parse(a.saved_at) || b.review_id.localeCompare(a.review_id));
    }
    function toDraft(ctx, item) {
      const value = snapshot(ctx, item);
      return review(ctx, {
        reviewer: value.reviewer, turn_reviews: value.turn_reviews, final_review: value.final_review,
        visibility: Object.fromEntries(VISIBILITY.map(key => [key, value.client[key]])),
      });
    }
    function mergeHistory(draft, saved, history) {
      for (const key of EVER) {
        draft.visibility[key] ||= Boolean(saved?.draft.visibility[key]) || history.some(item => item.client[key]);
      }
      return draft;
    }
    const api = {
      blank(input) { const ctx = context(input); return review(ctx, {}); },
      loadDraft(input) {
        const ctx = context(input), saved = readDraft(ctx), history = list(ctx);
        const latest = history[0];
        const draft = latest && (!saved || Date.parse(latest.saved_at) > Date.parse(saved.updated_at))
          ? toDraft(ctx, latest) : saved?.draft || review(ctx, {});
        return mergeHistory(draft, saved, history);
      },
      saveDraft(input, value) {
        const ctx = context(input);
        const draft = mergeHistory(review(ctx, value), readDraft(ctx), list(ctx));
        const envelope = { schema_version: DRAFT_SCHEMA, run_id: ctx.run_id, run_sha256: ctx.run_sha256,
          view_sha256: ctx.view_sha256, updated_at: new Date().toISOString(), draft };
        const text = JSON.stringify(bounded(envelope));
        io(store => store.setItem(draftKey(ctx), text));
        return copy(draft);
      },
      listSnapshots(input) { return list(context(input)); },
      resumeLatest(input) { return list(context(input))[0] || null; },
      snapshotToDraft(input, value) {
        const ctx = context(input);
        return mergeHistory(toDraft(ctx, value), readDraft(ctx), list(ctx));
      },
      createSnapshot(input, value) {
        const ctx = context(input), draft = review(ctx, value);
        return snapshot(ctx, { schema_version: SCHEMA, review_id: newId(), run_id: ctx.run_id,
          run_sha256: ctx.run_sha256, view_sha256: ctx.view_sha256, saved_at: new Date().toISOString(),
          reviewer: draft.reviewer, turn_reviews: draft.turn_reviews, final_review: draft.final_review,
          client: { ...draft.visibility, audit_scope: "browser_ui_only" } });
      },
      appendSnapshot(input, value) {
        const ctx = context(input), item = snapshot(ctx, value);
        const prior = list(ctx).find(record => record.review_id === item.review_id);
        if (prior) {
          if (canonical(prior) !== canonical(item)) fail("Review ID already exists with different content.");
          return { snapshot: prior, inserted: false };
        }
        const text = JSON.stringify(item);
        // Independent UUID storage keys avoid overwriting an existing record,
        // even when two tabs import the same review concurrently. No index.
        io(store => {
          let key;
          for (let attempt = 0; attempt < 5; attempt += 1) {
            key = `${group(ctx)}snapshot:${newId()}`;
            if (store.getItem(key) === null) { store.setItem(key, text); return; }
          }
          fail("Unable to create a unique snapshot key.");
        });
        return { snapshot: copy(item), inserted: true };
      },
      saveSnapshot(input, value) {
        const draft = api.saveDraft(input, value);
        return api.appendSnapshot(input, api.createSnapshot(input, draft));
      },
      exportSnapshot(input, value) { return `${JSON.stringify(api.createSnapshot(input, value), null, 2)}\n`; },
      importSnapshot(input, text) { return api.appendSnapshot(input, snapshot(context(input), parse(text))); },
    };
    return Object.freeze(api);
  }
  global.Case2RLReviewStore = Object.freeze({ create, schemaVersion: SCHEMA, maxImportBytes: MAX_BYTES });
})(window);
