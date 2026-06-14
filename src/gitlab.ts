import type { CommitLabWorkspace, GitLabSettings } from "./types";
import { normalizeWorkspace } from "./workspace";

export interface GitLabConnection extends GitLabSettings {
  token: string;
}

export interface RemoteWorkspace {
  workspace: CommitLabWorkspace;
  lastCommitId?: string;
}

const CONNECTION_STORAGE_KEY = "commitlab.gitlab.connection.v1";

export function getStoredGitLabConnection(): GitLabConnection | undefined {
  const raw = localStorage.getItem(CONNECTION_STORAGE_KEY);
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as Partial<GitLabConnection>;
    if (!parsed.baseUrl || !parsed.projectPath || !parsed.branch || !parsed.filePath || !parsed.token) {
      return undefined;
    }
    return normalizeConnection(parsed as GitLabConnection);
  } catch {
    localStorage.removeItem(CONNECTION_STORAGE_KEY);
    return undefined;
  }
}

export function storeGitLabConnection(connection: GitLabConnection) {
  localStorage.setItem(CONNECTION_STORAGE_KEY, JSON.stringify(normalizeConnection(connection)));
}

export function clearStoredGitLabConnection() {
  localStorage.removeItem(CONNECTION_STORAGE_KEY);
}

export function normalizeConnection(connection: GitLabConnection): GitLabConnection {
  return {
    baseUrl: trimTrailingSlash(connection.baseUrl || "https://gitlab.com"),
    projectPath: connection.projectPath.trim(),
    branch: connection.branch.trim() || "main",
    filePath: connection.filePath.trim() || "commitlab.json",
    token: connection.token.trim()
  };
}

export async function testGitLabConnection(connection: GitLabConnection) {
  await gitLabRequest(connection, `/projects/${encodePathSegment(connection.projectPath)}`);
}

export async function loadGitLabWorkspace(connection: GitLabConnection): Promise<RemoteWorkspace> {
  const file = await gitLabRequest<{ content: string; last_commit_id?: string }>(
    connection,
    `/projects/${encodePathSegment(connection.projectPath)}/repository/files/${encodePathSegment(connection.filePath)}?ref=${encodePathSegment(connection.branch)}`
  );

  return {
    workspace: normalizeWorkspace(JSON.parse(decodeBase64(file.content))),
    lastCommitId: file.last_commit_id
  };
}

export async function createGitLabWorkspace(connection: GitLabConnection, workspace: CommitLabWorkspace) {
  return commitGitLabWorkspace(connection, workspace, "Initialize CommitLab workspace");
}

export async function updateGitLabWorkspace(connection: GitLabConnection, workspace: CommitLabWorkspace, lastCommitId?: string) {
  return commitGitLabWorkspace(connection, workspace, "Update CommitLab workspace", lastCommitId);
}

export function isMissingGitLabFile(error: unknown) {
  if (!(error instanceof Error)) return false;
  return error.message.includes("404") || error.message.toLowerCase().includes("file not found");
}

async function commitGitLabWorkspace(connection: GitLabConnection, workspace: CommitLabWorkspace, message: string, lastCommitId?: string) {
  const body: {
    branch: string;
    commit_message: string;
    content: string;
    encoding: "base64";
    last_commit_id?: string;
  } = {
    branch: connection.branch,
    commit_message: message,
    content: encodeBase64(`${JSON.stringify(workspace, null, 2)}\n`),
    encoding: "base64"
  };

  if (lastCommitId) {
    body.last_commit_id = lastCommitId;
  }

  const result = await gitLabRequest<{ last_commit_id?: string; commit_id?: string }>(
    connection,
    `/projects/${encodePathSegment(connection.projectPath)}/repository/files/${encodePathSegment(connection.filePath)}`,
    {
      method: lastCommitId ? "PUT" : "POST",
      body: JSON.stringify(body)
    }
  );

  return result.last_commit_id ?? result.commit_id;
}

async function gitLabRequest<T>(connection: GitLabConnection, path: string, init?: RequestInit) {
  const normalized = normalizeConnection(connection);
  const response = await fetch(`${normalized.baseUrl}/api/v4${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "PRIVATE-TOKEN": normalized.token,
      ...init?.headers
    }
  });

  if (!response.ok) {
    const details = await response.json().catch(() => undefined);
    throw new Error(getApiErrorMessage(response, details));
  }

  return response.json() as Promise<T>;
}

function getApiErrorMessage(response: Response, details: unknown) {
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

  return `GitLab API error ${response.status}: ${readableDetail}`;
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

function encodePathSegment(value: string) {
  return encodeURIComponent(value);
}

function trimTrailingSlash(value: string) {
  return value.trim().replace(/\/+$/, "");
}
