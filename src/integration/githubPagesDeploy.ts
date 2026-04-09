import axios from "axios";
import { safeOutcomeFileSlug } from "./deploySlug";

type GhContentResponse = { sha?: string };

/**
 * Directory inside the GitHub repo for outcome HTML (mirrors site `/ai/`).
 * Set `GITHUB_PAGES_PATH=` empty to commit to repo root instead.
 * Default when unset: `ai`.
 */
export function githubPagesContentPathPrefix(): string {
  const raw = process.env.GITHUB_PAGES_PATH;
  if (raw === undefined) return "ai";
  return raw.trim().replace(/^\/+|\/+$/g, "");
}

function publicUrlForRepoPath(siteBase: string, repoRelativePath: string): string {
  const base = siteBase.replace(/\/$/, "");
  return `${base}/${repoRelativePath}`;
}

/** Predict canonical GitHub Pages URL for a slug (same rules as post-deploy URL). */
export function predictPublicGithubPagesUrl(rawSlug: string): string | null {
  const owner = process.env.GITHUB_USERNAME?.trim() || process.env.GITHUB_OWNER?.trim();
  const repo = process.env.GITHUB_REPO?.trim();
  if (!owner || !repo) return null;
  const safe = safeOutcomeFileSlug(rawSlug);
  const root = githubPagesContentPathPrefix();
  const filePath = root ? `${root}/${safe}.html` : `${safe}.html`;
  const siteBase =
    process.env.GITHUB_PAGES_SITE_BASE?.trim().replace(/\/$/, "") ||
    `https://${owner}.github.io/${repo}`;
  return publicUrlForRepoPath(siteBase, filePath);
}

/**
 * Commit a single HTML file via GitHub Contents API.
 * Configure GitHub Pages (branch / docs / root) in repo settings separately.
 *
 * Env: GITHUB_TOKEN, GITHUB_USERNAME (or GITHUB_OWNER), GITHUB_REPO
 * Optional: GITHUB_PAGES_BRANCH (default main), GITHUB_PAGES_PATH (default `ai`; empty = repo root),
 *           GITHUB_PAGES_SITE_BASE (override public URL, no trailing slash)
 */
export async function deployToGitHubPages(html: string, slug: string): Promise<string | null> {
  const token = process.env.GITHUB_TOKEN?.trim();
  const owner = process.env.GITHUB_USERNAME?.trim() || process.env.GITHUB_OWNER?.trim();
  const repo = process.env.GITHUB_REPO?.trim();
  const branch = process.env.GITHUB_PAGES_BRANCH?.trim() || "main";
  const root = githubPagesContentPathPrefix();

  if (!token || !owner || !repo) {
    console.warn(
      "[github-pages] Missing GITHUB_TOKEN or GITHUB_USERNAME/GITHUB_OWNER or GITHUB_REPO — skipping deploy",
    );
    return null;
  }

  const safeSlug = safeOutcomeFileSlug(slug);
  const filePath = root ? `${root}/${safeSlug}.html` : `${safeSlug}.html`;
  const encodedPath = filePath
    .split("/")
    .filter(Boolean)
    .map(encodeURIComponent)
    .join("/");

  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${encodedPath}`;
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "vigilnode-ai-dominance-engine/1.0",
  };

  let sha: string | undefined;
  try {
    const existing = await axios.get<GhContentResponse>(apiUrl, {
      headers,
      params: { ref: branch },
      validateStatus: () => true,
    });
    if (existing.status === 200 && existing.data?.sha) sha = existing.data.sha;
  } catch {
    /* treat as new file */
  }

  const content = Buffer.from(html, "utf8").toString("base64");
  const putBody = {
    message: `chore: deploy outcome page ${safeSlug}`,
    content,
    branch,
    ...(sha ? { sha } : {}),
  };

  const putRes = await axios.put<
    unknown,
    { status: number; data: { message?: string; documentation_url?: string } }
  >(apiUrl, putBody, { headers, validateStatus: () => true });

  if (putRes.status !== 200 && putRes.status !== 201) {
    const detail = putRes.data?.message ?? JSON.stringify(putRes.data ?? {});
    console.error(
      "[github-pages] PUT failed:",
      putRes.status,
      detail,
      `(repo=${owner}/${repo} branch=${branch} path=${filePath})`,
    );
    return null;
  }

  const siteBase =
    process.env.GITHUB_PAGES_SITE_BASE?.trim().replace(/\/$/, "") ||
    `https://${owner}.github.io/${repo}`;
  return publicUrlForRepoPath(siteBase, filePath);
}
