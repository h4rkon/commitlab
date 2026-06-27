import type { CommitLabWorkspace, GitConnectionSettings } from "./types";
import { normalizeWorkspace } from "./workspace";

export interface GitConnection extends GitConnectionSettings {
  token: string;
}

export interface RemoteWorkspace {
  workspace: CommitLabWorkspace;
  lastCommitId?: string;
}

const CONNECTION_STORAGE_KEY = "commitlab.git.connection.v1";
const LEGACY_CONNECTION_STORAGE_KEY = "commitlab.gitlab.connection.v1";

export function getStoredGitConnection(): GitConnection | undefined {
  const raw = localStorage.getItem(CONNECTION_STORAGE_KEY) ?? localStorage.getItem(LEGACY_CONNECTION_STORAGE_KEY);
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as Partial<GitConnection>;
    const normalized = normalizeConnection({
      provider: parsed.provider ?? "gitlab",
      baseUrl: parsed.baseUrl ?? "https://gitlab.com",
      projectPath: parsed.projectPath ?? "",
      branch: parsed.branch ?? "main",
      filePath: parsed.filePath ?? "commitlab.json",
      token: parsed.token ?? ""
    });
    if (!normalized.projectPath || !normalized.branch || !normalized.filePath || !normalized.token) {
      return undefined;
    }
    return normalized;
  } catch {
    localStorage.removeItem(CONNECTION_STORAGE_KEY);
    localStorage.removeItem(LEGACY_CONNECTION_STORAGE_KEY);
    return undefined;
  }
}

export function storeGitConnection(connection: GitConnection) {
  localStorage.setItem(CONNECTION_STORAGE_KEY, JSON.stringify(normalizeConnection(connection)));
  localStorage.removeItem(LEGACY_CONNECTION_STORAGE_KEY);
}

export function clearStoredGitConnection() {
  localStorage.removeItem(CONNECTION_STORAGE_KEY);
  localStorage.removeItem(LEGACY_CONNECTION_STORAGE_KEY);
}

export function normalizeConnection(connection: GitConnection): GitConnection {
  const provider = connection.provider ?? "gitlab";
  return {
    provider,
    baseUrl: trimTrailingSlash(connection.baseUrl || (provider === "github" ? "https://github.com" : "https://gitlab.com")),
    projectPath: connection.projectPath.trim(),
    branch: connection.branch.trim() || "main",
    filePath: connection.filePath.trim() || "commitlab.json",
    token: connection.token.trim()
  };
}

export async function testGitConnection(connection: GitConnection) {
  const normalized = normalizeConnection(connection);
  if (normalized.provider === "github") {
    const repo = parseGitHubRepo(normalized.projectPath);
    await gitHubRequest(normalized, `/repos/${repo.owner}/${repo.repo}`);
    return;
  }
  await gitLabRequest(normalized, `/projects/${encodePathSegment(normalized.projectPath)}`);
}

export async function loadGitWorkspace(connection: GitConnection): Promise<RemoteWorkspace> {
  const normalized = normalizeConnection(connection);
  if (normalized.provider === "github") {
    const repo = parseGitHubRepo(normalized.projectPath);
    const file = await gitHubRequest<{ content: string; sha: string }>(
      normalized,
      `/repos/${repo.owner}/${repo.repo}/contents/${encodePath(normalized.filePath)}?ref=${encodePathSegment(normalized.branch)}`
    );
    return {
      workspace: normalizeWorkspace(JSON.parse(decodeBase64(file.content))),
      lastCommitId: file.sha
    };
  }

  const file = await gitLabRequest<{ content: string; last_commit_id?: string }>(
    normalized,
    `/projects/${encodePathSegment(normalized.projectPath)}/repository/files/${encodePathSegment(normalized.filePath)}?ref=${encodePathSegment(normalized.branch)}`
  );

  return {
    workspace: normalizeWorkspace(JSON.parse(decodeBase64(file.content))),
    lastCommitId: file.last_commit_id
  };
}

export async function createGitWorkspace(connection: GitConnection, workspace: CommitLabWorkspace) {
  return commitGitWorkspace(connection, workspace, "Initialize CommitLab workspace");
}

export async function updateGitWorkspace(connection: GitConnection, workspace: CommitLabWorkspace, lastCommitId?: string) {
  return commitGitWorkspace(connection, workspace, "Update CommitLab workspace", lastCommitId);
}

export function isMissingGitFile(error: unknown) {
  if (!(error instanceof Error)) return false;
  return error.message.includes("404") || error.message.toLowerCase().includes("not found") || error.message.toLowerCase().includes("file not found");
}

async function commitGitWorkspace(connection: GitConnection, workspace: CommitLabWorkspace, message: string, lastCommitId?: string) {
  const normalized = normalizeConnection(connection);
  if (normalized.provider === "github") {
    const repo = parseGitHubRepo(normalized.projectPath);
    const body: {
      message: string;
      content: string;
      branch: string;
      sha?: string;
    } = {
      message,
      content: encodeBase64(`${JSON.stringify(workspace, null, 2)}\n`),
      branch: normalized.branch
    };

    if (lastCommitId) {
      body.sha = lastCommitId;
    }

    const result = await gitHubRequest<{ content?: { sha?: string } }>(
      normalized,
      `/repos/${repo.owner}/${repo.repo}/contents/${encodePath(normalized.filePath)}`,
      {
        method: "PUT",
        body: JSON.stringify(body)
      }
    );
    return result.content?.sha;
  }

  const body: {
    branch: string;
    commit_message: string;
    content: string;
    encoding: "base64";
    last_commit_id?: string;
  } = {
    branch: normalized.branch,
    commit_message: message,
    content: encodeBase64(`${JSON.stringify(workspace, null, 2)}\n`),
    encoding: "base64"
  };

  if (lastCommitId) {
    body.last_commit_id = lastCommitId;
  }

  const result = await gitLabRequest<{ last_commit_id?: string; commit_id?: string }>(
    normalized,
    `/projects/${encodePathSegment(normalized.projectPath)}/repository/files/${encodePathSegment(normalized.filePath)}`,
    {
      method: lastCommitId ? "PUT" : "POST",
      body: JSON.stringify(body)
    }
  );

  return result.last_commit_id ?? result.commit_id;
}

async function gitLabRequest<T>(connection: GitConnection, path: string, init?: RequestInit) {
  const response = await fetch(`${connection.baseUrl}/api/v4${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "PRIVATE-TOKEN": connection.token,
      ...init?.headers
    }
  });

  if (!response.ok) {
    const details = await response.json().catch(() => undefined);
    throw new Error(getApiErrorMessage("GitLab", response, details));
  }

  return response.json() as Promise<T>;
}

async function gitHubRequest<T>(connection: GitConnection, path: string, init?: RequestInit) {
  const response = await fetch(`${githubApiBaseUrl(connection.baseUrl)}${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${connection.token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...init?.headers
    }
  });

  if (!response.ok) {
    const details = await response.json().catch(() => undefined);
    throw new Error(getApiErrorMessage("GitHub", response, details));
  }

  return response.json() as Promise<T>;
}

function getApiErrorMessage(provider: "GitHub" | "GitLab", response: Response, details: unknown) {
  const detailRecord = details && typeof details === "object" ? (details as Record<string, unknown>) : undefined;
  const message = detailRecord?.message;
  const errorDescription = detailRecord?.error_description;
  const error = detailRecord?.error;
  const readableDetail =
    typeof errorDescription === "string"
      ? errorDescription
      : typeof message === "string"
        ? message
        : typeof error === "string"
          ? error
          : message && typeof message === "object"
            ? JSON.stringify(message)
            : response.statusText || "Request failed";

  return `${provider} API error ${response.status}: ${readableDetail}`;
}

function parseGitHubRepo(projectPath: string) {
  const normalized = projectPath.trim().replace(/^https:\/\/github\.com\//, "").replace(/\.git$/, "");
  const [owner, repo] = normalized.split("/").filter(Boolean);
  if (!owner || !repo) {
    throw new Error("Use a GitHub repository path like owner/repo.");
  }
  return { owner, repo };
}

function githubApiBaseUrl(baseUrl: string) {
  if (baseUrl === "https://github.com") return "https://api.github.com";
  return `${baseUrl}/api/v3`;
}

function encodeBase64(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function decodeBase64(value: string) {
  const binary = atob(value.replace(/\s/g, ""));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function encodePath(value: string) {
  return value.split("/").map(encodePathSegment).join("/");
}

function encodePathSegment(value: string) {
  return encodeURIComponent(value);
}

function trimTrailingSlash(value: string) {
  return value.trim().replace(/\/+$/, "");
}
