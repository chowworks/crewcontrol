import { defineRailway, github, postgres, preserve, project, service, volume } from 'railway/iac'

/**
 * CrewControl on Railway, declared in code the way Interview and Audit Differently are. `railway config plan`
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

// Uploaded photos. They are written to UPLOAD_DIR, so it sits on a volume, or they vanish on redeploy.
const UPLOADS_MOUNT = '/data'
const uploads = () =>
  volume('uploads', {
    alerts: { usage: { '100': {}, '80': {}, '95': {} } },
    region: REGION,
    sizeMB: 500,
  })

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
      // The seed puts the three demo trips back in their starting shape on every deploy (prisma/seed.ts).
      start: 'npx prisma migrate deploy && npm run db:seed && node dist/main.js',
      deploy: { restartPolicyMaxRetries: 3 },
      replicas: { [REGION]: 1 },
      volumeMounts: { [UPLOADS_MOUNT]: uploads() },
      env: {
        NODE_ENV: 'development',
        DATABASE_URL: '${{Postgres.DATABASE_URL}}',
        // The web app's address, for CORS: a laptop (http://localhost:5373) or the Vercel project's address.
        FRONTEND_URL: preserve(),
        API_PUBLIC_URL: 'https://${{RAILWAY_PUBLIC_DOMAIN}}',
        UPLOAD_DIR: `${UPLOADS_MOUNT}/uploads`,
        SUPPORT_EMAIL: 'support@crewcontrol.vacations',
        // Where contact form messages go (logged, not sent, until email is built).
        SUPPORT_EMAIL: 'support@crewcontrol.vacations',
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
    start: 'npx prisma migrate deploy && node dist/main.js',
    deploy: { restartPolicyMaxRetries: 3 },
    replicas: { [REGION]: 1 },
    volumeMounts: { [UPLOADS_MOUNT]: uploads() },
    env: {
      NODE_ENV: 'production',
      DATABASE_URL: '${{Postgres.DATABASE_URL}}',
      // The web app's address, for CORS.
      FRONTEND_URL: preserve(),
      // This service's own public address; photo URLs are built from it.
      API_PUBLIC_URL: preserve(),
      UPLOAD_DIR: `${UPLOADS_MOUNT}/uploads`,
      SUPPORT_EMAIL: 'support@crewcontrol.vacations',
    },
  })

  return project('crewcontrol', { resources: [Postgres, api] })
})
