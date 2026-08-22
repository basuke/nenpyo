/// <reference types="../worker-configuration.d.ts" />

import type { SessionUser } from "$lib/server/auth";
import type { OAuthHelpers } from "$lib/server/mcp/consent";

declare global {
  /** Bindings and secrets available on the Worker. */
  interface AppEnv extends Env {
    /** GitHub OAuth App client id. Set as a secret (or in .dev.vars). */
    GITHUB_CLIENT_ID: string;
    /** GitHub OAuth App client secret. Set as a secret (or in .dev.vars). */
    GITHUB_CLIENT_SECRET: string;
    /** Session and token store for the MCP OAuth provider. */
    OAUTH_KV: KVNamespace;
    /**
     * Injected by OAuthProvider in worker/index.ts, not by wrangler.
     * The consent screen uses it to complete the authorization (docs/007-mcp.md).
     */
    OAUTH_PROVIDER: OAuthHelpers;
  }

  namespace App {
    interface Locals {
      /** The signed-in user, or null when anonymous. */
      user: SessionUser | null;
    }
    interface Platform {
      env: AppEnv;
      cf: CfProperties;
      ctx: ExecutionContext;
    }
    interface Error {
      message: string;
    }
  }
}

export {};
