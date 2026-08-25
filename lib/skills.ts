/**
 * Unified skill normalization.
 *
 * Single source of truth used by both the matching engine and the
 * vacancy import parser, so a skill written as "CI/CD" in a resume
 * and "cicd" in a vacancy normalize to the same canonical name.
 */

// Canonical aliases: merge of the former matching/vacancy-import tables.
// Dots and dashes are stripped before lookup; slashes are preserved
// (so "ci/cd" hits its alias directly).
const SKILL_ALIASES: Record<string, string> = {
  "react.js": "react",
  "reactjs": "react",
  "vue.js": "vue",
  "vuejs": "vue",
  "angular.js": "angular",
  "angularjs": "angular",
  "next.js": "nextjs",
  "nuxt.js": "nuxtjs",
  "node.js": "node",
  "nodejs": "node",
  "js": "javascript",
  "ts": "typescript",
  "py": "python",
  "postgres": "postgresql",
  "psql": "postgresql",
  "mongo": "mongodb",
  "github": "git",
  "gitlab": "git",
  "k8s": "kubernetes",
  "graph ql": "graphql",
  "scss": "sass",
  "tailwindcss": "tailwind",
  "c#": "csharp",
  "golang": "go",
  "ruby on rails": "rails",
  "amazon web services": "aws",
  "google cloud": "gcp",
  "adobe xd": "xd",
  "rest api": "rest",
  "restful": "rest",
  "rest apis": "rest",
  "ci/cd": "cicd",
  "ci cd": "cicd",
  "microsoft excel": "excel",
  "ms excel": "excel",
  "google sheets": "google_sheets",
};

function normalizeSkill(raw: string): string {
  if (typeof raw !== "string") return "";
  let s = raw.toLowerCase().trim().replace(/\s+/g, " ");
  // Remove dots and dashes (Vue.JS → vuejs, part-time style typos), keep "/" (ci/cd)
  s = s.replace(/[.\-]/g, "");
  s = s.replace(/\s+/g, " ").trim();
  return SKILL_ALIASES[s] ?? s;
}

/**
 * Remove skills that normalize to an already-seen canonical name,
 * keeping the first occurrence's original display value.
 */
function dedupeSkills(names: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of names) {
    const key = normalizeSkill(raw);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(raw);
  }
  return result;
}

export { normalizeSkill, dedupeSkills, SKILL_ALIASES };
