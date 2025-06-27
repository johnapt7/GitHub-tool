export interface GitHubAppConfig {
  appId: number;
  privateKey: string;
  webhookSecret?: string | undefined;
  clientId?: string | undefined;
  clientSecret?: string | undefined;
}

export interface InstallationToken {
  token: string;
  expiresAt: Date;
  permissions: Record<string, string>;
  repositorySelection: 'all' | 'selected';
}

export interface CachedToken extends InstallationToken {
  installationId: number;
  cachedAt: Date;
}

export interface GitHubRateLimit {
  limit: number;
  remaining: number;
  reset: Date;
  used: number;
  resource: string;
}

export interface GitHubApiError extends Error {
  status?: number;
  response?: {
    status: number;
    data: unknown;
    headers: Record<string, string>;
  };
  request?: {
    method: string;
    url: string;
    headers: Record<string, string>;
  };
}

export interface InstallationInfo {
  id: number;
  account: {
    login: string;
    id: number;
    type: 'User' | 'Organization';
  };
  repositorySelection: 'all' | 'selected';
  permissions: Record<string, string>;
  events: string[];
}

export interface TokenRefreshResult {
  token: string;
  expiresAt: Date;
  refreshed: boolean;
  error?: string;
}

// GitHub Webhook Event Types
export interface GitHubWebhookHeaders {
  'x-github-event': string;
  'x-github-delivery': string;
  'x-hub-signature-256': string;
  'user-agent': string;
  'content-type': string;
}

export interface GitHubWebhookEvent {
  eventType: string;
  deliveryId: string;
  payload: Record<string, any>;
  headers: GitHubWebhookHeaders;
  signature: string;
  timestamp: number;
}

// Common webhook payload structures
export interface Repository {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  owner: {
    login: string;
    id: number;
    type: 'User' | 'Organization';
  };
  html_url: string;
  clone_url: string;
  ssh_url: string;
  default_branch: string;
}

export interface User {
  login: string;
  id: number;
  type: 'User' | 'Bot';
  avatar_url: string;
  html_url: string;
}

export interface PushEvent {
  ref: string;
  before: string;
  after: string;
  created: boolean;
  deleted: boolean;
  forced: boolean;
  base_ref: string | null;
  compare: string;
  commits: Array<{
    id: string;
    tree_id: string;
    message: string;
    timestamp: string;
    author: {
      name: string;
      email: string;
      username?: string;
    };
    committer: {
      name: string;
      email: string;
      username?: string;
    };
    added: string[];
    removed: string[];
    modified: string[];
  }>;
  head_commit: any;
  repository: Repository;
  pusher: {
    name: string;
    email: string;
  };
  sender: User;
}

export interface PullRequestEvent {
  action: 'opened' | 'closed' | 'reopened' | 'synchronize' | 'edited' | 'assigned' | 'unassigned' | 'review_requested' | 'review_request_removed' | 'labeled' | 'unlabeled' | 'ready_for_review' | 'converted_to_draft';
  number: number;
  pull_request: {
    id: number;
    number: number;
    state: 'open' | 'closed';
    title: string;
    body: string;
    user: User;
    head: {
      ref: string;
      sha: string;
      repo: Repository;
    };
    base: {
      ref: string;
      sha: string;
      repo: Repository;
    };
    merged: boolean;
    merge_commit_sha: string | null;
    html_url: string;
    created_at: string;
    updated_at: string;
    closed_at: string | null;
    merged_at: string | null;
  };
  repository: Repository;
  sender: User;
}

export interface IssuesEvent {
  action: 'opened' | 'edited' | 'closed' | 'reopened' | 'assigned' | 'unassigned' | 'labeled' | 'unlabeled' | 'milestoned' | 'demilestoned' | 'transferred' | 'pinned' | 'unpinned' | 'locked' | 'unlocked';
  issue: {
    id: number;
    number: number;
    title: string;
    body: string;
    state: 'open' | 'closed';
    user: User;
    assignee: User | null;
    assignees: User[];
    labels: Array<{
      id: number;
      name: string;
      color: string;
      description: string;
    }>;
    html_url: string;
    created_at: string;
    updated_at: string;
    closed_at: string | null;
  };
  repository: Repository;
  sender: User;
}

export interface ReleaseEvent {
  action: 'published' | 'unpublished' | 'created' | 'edited' | 'deleted' | 'prereleased' | 'released';
  release: {
    id: number;
    tag_name: string;
    target_commitish: string;
    name: string;
    body: string;
    draft: boolean;
    prerelease: boolean;
    created_at: string;
    published_at: string;
    author: User;
    html_url: string;
    assets: Array<{
      id: number;
      name: string;
      content_type: string;
      size: number;
      download_count: number;
      browser_download_url: string;
    }>;
  };
  repository: Repository;
  sender: User;
}

export type GitHubEventPayload = 
  | PushEvent 
  | PullRequestEvent 
  | IssuesEvent 
  | ReleaseEvent 
  | Record<string, any>; // Fallback for other event types