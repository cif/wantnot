import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './app/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: 'postgresql://neondb_owner:npg_Osn8o5GLIqMB@ep-long-wind-ae91akfo.c-2.us-east-2.aws.neon.tech/wantnot?sslmode=require',
  },
  verbose: true,
  strict: true,
  studio: {
    port: 5555,
  },
});