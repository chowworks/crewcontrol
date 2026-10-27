import { defineRailway, github, postgres, preserve, project, service, volume } from 'railway/iac'

/**
 * Travel HQ on Railway, declared in code the way Interview and Audit Differently are. `railway config plan`
 * shows what would change; CI applies this file on a push to main once deploys are switched on
 * (.github/workflows/ci.yml). Nothing here holds a secret: values marked preserve() are set by hand in Railway
 * and left alone. A project token is tied to one environment, so the file is applied to dev or production
 * depending on which token CI holds (DEVELOPMENT.md, "The shared dev environment").
 *
 * Before the first apply: create the Railway project and its `dev` environment (`railway environment new dev`;
 * IaC can't create one), add RAILWAY_TOKEN as a repository secret, then `railway config pull` to bring
 * Railway's own Postgres volume into this file.
 */
const REGION = 'us-east4-eqdc4a'

// Nixpacks picks up apps/api/nixpacks.toml from the root directory. The API's build only has apps/api, which is
// why it carries a copy of packages/types (DEVELOPMENT.md).
const build = {
  buildCommand: 'npx prisma generate && /app/node_modules/.bin/nest build',
  buildEnvironment: 'V3',
  builder: 'NIXPACKS',
} as const

// Trip photos now live in R2 (R2_*, below). The volume where they used to be written stays until the photos already
// on it are copied to R2 and their trips point there; then it and its mount can go.
const UPLOADS_MOUNT = '/data'
const uploads = () =>
  volume('uploads', {
    alerts: { usage: { '100': {}, '80': {}, '95': {} } },
    region: REGION,
    sizeMB: 500,
  })

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
  // nothing real. `api-dev` runs beside it with no GitHub source: CI deploys main to it, and
  // apps/api/scripts/deploy-dev.sh deploys any branch's working tree by hand. There are no secrets in dev, so
  // every value but the web app's address is set here.
  if (ctx.isEnvironment('dev')) {
    Postgres.networking = { privateNetworkEndpoint: 'postgres', tcpProxies: { '5432': {} } }
    const apiDev = service('api-dev', {
      build,
      // Migrations as the owner, then the restricted role kept in step with this deploy (scripts/ensure-app-role.ts),
      // then the seed puts the three demo trips back in their starting shape (prisma/seed.ts).
      start:
        'npx prisma migrate deploy && npm run role:ensure && npm run db:seed && node dist/main.js',
      deploy: { restartPolicyMaxRetries: 3 },
      replicas: { [REGION]: 1 },
      volumeMounts: { [UPLOADS_MOUNT]: uploads() },
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
        // Where contact form messages go (logged, not sent, until email is built).
        SUPPORT_EMAIL: 'support@travel-hq.app',
        // Clerk's secret key for this environment, set by hand in Railway.
        CLERK_SECRET_KEY: preserve(),
      },
    })
    return project('crewcontrol', { resources: [Postgres, apiDev] })
  }

  // Production: private network only, and no seed on start, so a trip an organizer made is never touched by it.
  Postgres.networking = { privateNetworkEndpoint: 'postgres' }
  const api = service('crewcontrol-api', {
    source: github('chowworks/crewcontrol', {
      checkSuites: true,
      rootDirectory: '/apps/api',
    }),
    build: { ...build, watchPatterns: ['apps/api/**', 'packages/types/**'] },
    // As in dev: migrations as the owner, then the restricted role kept in step (scripts/ensure-app-role.ts). No seed.
    start: 'npx prisma migrate deploy && npm run role:ensure && node dist/main.js',
    deploy: { restartPolicyMaxRetries: 3 },
    replicas: { [REGION]: 1 },
    volumeMounts: { [UPLOADS_MOUNT]: uploads() },
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
      CLERK_SECRET_KEY: preserve(),
    },
  })

  return project('crewcontrol', { resources: [Postgres, api] })
})
