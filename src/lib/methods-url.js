// The one place the APP writes the path to the Methods & Mathematical Reference.
//
// Scope, stated precisely because the previous wording overclaimed: every link the
// Svelte app emits is built from here, but the repo has other consumers that are not
// and should not be — `index.html`'s no-JS/SEO shell, `public/sitemap.xml`, `llms.txt`
// and the README all carry the root-absolute `/methods` form. Do NOT "fix" those to
// match: `public/_headers` 307-redirects `/methods.html` → `/methods`, so the relative
// form here is the one that resolves in dev AND prod, and the pretty form is the one
// that belongs in canonical/SEO markup.
//
// Relative (not root-absolute) so it resolves under any base path, and every link built
// from it opens in a new tab — a reader who clicks through from a slider is mid-analysis
// and must not lose their recording.
//
// The anchors below must match headings in public/methods.html. Nothing in the build
// checks that, so if you rename an anchor there, rename it here.
export const METHODS_URL = 'methods.html';

// §5 "Regularized least squares" — the objective, the Laplacian, and what λ weights.
export const METHODS_REGULARIZATION_URL = `${METHODS_URL}#regularization`;

// §8 "The four goodness-of-fit checks" — λ-stability is part of check 3. Linked
// wherever the app names the four checks, so the canonical enumeration is one hop away.
export const METHODS_CHECKS_URL = `${METHODS_URL}#checks`;

// Tab 0's plain-language λ section, in THIS app (see App.svelte's initialTab).
// The "?" beside each λ slider points here and opens it in a new browser tab —
// deliberately, because switching tabs in place unmounts Tab 2 and discards the
// reader's loaded recording. A help affordance must not cost someone their work.
export const LAMBDA_EXPLAINER_URL = '#lambda';

// Every anchor that must exist as an `id=` in public/methods.html. src/lib/core/core.test.mjs
// asserts each one, so a renamed heading fails the tests (and the deploy) instead of quietly
// degrading the link to "top of a 600-line document". LAMBDA_EXPLAINER_URL is deliberately
// absent: it targets a section in THIS app, not the methods doc.
export const METHODS_ANCHORS = {
  regularization: METHODS_REGULARIZATION_URL,
  checks: METHODS_CHECKS_URL,
};
