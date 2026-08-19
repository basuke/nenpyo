/// <reference types="../worker-configuration.d.ts" />

import type { SessionUser } from "$lib/server/auth";

declare global {
  /** Bindings and secrets available on the Worker. */
  interface AppEnv extends Env {
    /** GitHub OAuth App client id. Set as a secret (or in .dev.vars). */
    GITHUB_CLIENT_ID: string;
    /** GitHub OAuth App client secret. Set as a secret (or in .dev.vars). */
    GITHUB_CLIENT_SECRET: string;
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
