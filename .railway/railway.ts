import { bucket, defineRailway, github, postgres, preserve, project, service } from 'railway/iac'

/**
 * Travel HQ on Railway, declared in code the way Interview and Audit Differently are. `railway config plan`
 * shows what would change; CI applies this file on a push to main once deploys are switched on
 * (.github/workflows/ci.yml). Nothing here holds a secret: values marked preserve() are set by hand in Railway
 * and left alone. CI's project token is production's, so CI applies this file to production; dev's half is applied
 * by hand (DEVELOPMENT.md, "The shared dev environment").
 *
 * Before the first apply: create the Railway project and its `dev` environment (`railway environment new dev`;
 * IaC can't create one), add RAILWAY_TOKEN as a repository secret, then `railway config pull` to bring
 * Railway's own Postgres volume into this file.
 */
const REGION = 'us-east4-eqdc4a'

// Built from the repository root as one npm workspace, as Audit Differently is; nixpacks.toml at the root installs it.
const build = {
  buildCommand: 'npm run build -w @cc/api',
  buildEnvironment: 'V3',
  builder: 'NIXPACKS',
} as const

// Set by hand in each environment: the R2 bucket's keys hold a secret, and each environment has its own bucket.
const photoBucket = {
  R2_ACCOUNT_ID: preserve(),
  R2_ACCESS_KEY_ID: preserve(),
  R2_SECRET_ACCESS_KEY: preserve(),
  R2_PHOTOS_BUCKET: preserve(),
}

export default defineRailway((ctx) => {
  const Postgres = postgres('Postgres', { region: REGION })

  // `dev`: the shared development environment. Its Postgres has a public TCP proxy so laptops can point
  // apps/api/.env at it (its DATABASE_PUBLIC_URL) and run the seed there; it holds the fictional seed trips and
  // nothing real. `api-dev` runs beside it with no GitHub source: apps/api/scripts/deploy-dev.sh deploys any
  // branch's working tree to it by hand. There are no secrets in dev, so
  // every value but the web app's address is set here.
  if (ctx.isEnvironment('dev')) {
    Postgres.networking = { privateNetworkEndpoint: 'postgres', tcpProxies: { '5432': {} } }
    const apiDev = service('api-dev', {
      build,
      // Migrations as the owner, then the restricted role kept in step with this deploy (scripts/ensure-app-role.ts),
      // then the seed puts the three demo trips back in their starting shape (prisma/seed.ts).
      start: 'npm run deploy:start -w @cc/api',
      deploy: { restartPolicyMaxRetries: 3 },
      replicas: { [REGION]: 1 },
      env: {
        NODE_ENV: 'development',
        // Row-level security (docs/tenant-isolation.md): the API connects as the restricted role cc_app, set by hand
        // because it holds the role's password (postgresql://cc_app:<password>@postgres.railway.internal:5432/
        // railway?sslmode=require); migrations, the seed and role:ensure use the owner.
        DATABASE_URL: preserve(),
        SCHEMA_DATABASE_URL: '${{Postgres.DATABASE_URL}}?sslmode=require',
        REQUIRE_TENANT_RLS: 'on',
        // The web app's address, for CORS: a laptop (http://localhost:5373) or the Vercel project's address.
        FRONTEND_URL: preserve(),
        // Trip photos: the dev R2 bucket, private; guests get signed links (DEVELOPMENT.md, "Photos").
        ...photoBucket,
        // Where contact form messages go.
        SUPPORT_EMAIL: 'support@travel-hq.app',
        // Resend's API key for this environment, set by hand in Railway. Without it, email is logged, not sent. Dev
        // uses its own Resend account, so EMAIL_FROM is an address on a domain verified there, set by hand too.
        RESEND_API_KEY: preserve(),
        EMAIL_FROM: preserve(),
        // The signing secret of this environment's Resend webhook (bounces and spam complaints), set by hand.
        RESEND_WEBHOOK_SECRET: preserve(),
        // The developer address every dev email goes to instead, marked as a test that names who it was for
        // (send-email.ts), set by hand. Unset, dev emails go to whoever they're for. Never set in production.
        DEV_EMAIL_TO: preserve(),
        // Forwarded receipts (issue #12): the subdomain Resend receives trips' receipts on (its MX points at Resend,
        // as DEVELOPMENT.md says) and a Full access Resend key to read each email, both set by hand. Either unset,
        // receiving is off. The webhook above also takes email.received.
        RECEIPTS_DOMAIN: preserve(),
        RESEND_RECEIVING_API_KEY: preserve(),
        // Clerk's secret key for this environment, set by hand in Railway.
        CLERK_SECRET_KEY: preserve(),
      },
    })
    return project('crewcontrol', { resources: [Postgres, apiDev] })
  }

  // Production: private network only. The seed runs on start as in dev, so the homepage's demo trips are there; it
  // replaces only trips marked isSample, so a trip an organizer made is never touched by it.
  // A push to main deploys here; try a change on dev first with apps/api/scripts/deploy-dev.sh.
  Postgres.networking = { privateNetworkEndpoint: 'postgres' }
  // Railway's point-in-time recovery for Postgres keeps its log in this bucket (switched on in the dashboard).
  const PostgresPITR = bucket('Postgres-PITR', { region: 'iad' })
  const api = service('crewcontrol-api', {
    source: github('chowworks/crewcontrol', { checkSuites: true }),
    build: { ...build, watchPatterns: ['apps/api/**', 'packages/types/**', 'package*.json'] },
    // As in dev: migrations as the owner, the restricted role kept in step (scripts/ensure-app-role.ts), then the seed.
    start: 'npm run deploy:start -w @cc/api',
    deploy: { restartPolicyMaxRetries: 3 },
    replicas: { [REGION]: 1 },
    env: {
      NODE_ENV: 'production',
      // Row-level security, as in dev: the API connects as the restricted role cc_app, set by hand because it holds
      // the role's password; migrations and role:ensure use the owner.
      DATABASE_URL: preserve(),
      SCHEMA_DATABASE_URL: '${{Postgres.DATABASE_URL}}?sslmode=require',
      REQUIRE_TENANT_RLS: 'on',
      // The web app's address, for CORS.
      FRONTEND_URL: preserve(),
      // Trip photos: production's R2 bucket, private; guests get signed links.
      ...photoBucket,
      SUPPORT_EMAIL: 'support@travel-hq.app',
      // Production's own Resend account, with travel-hq.app verified there.
      RESEND_API_KEY: preserve(),
      EMAIL_FROM: 'Travel HQ <trips@travel-hq.app>',
      RESEND_WEBHOOK_SECRET: preserve(),
      // Forwarded receipts, as in dev: production's receiving subdomain and Full access key, set by hand.
      RECEIPTS_DOMAIN: preserve(),
      RESEND_RECEIVING_API_KEY: preserve(),
      CLERK_SECRET_KEY: preserve(),
    },
  })

  return project('crewcontrol', { resources: [Postgres, PostgresPITR, api] })
})
