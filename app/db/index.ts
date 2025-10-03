import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const connectionString = process.env.DATABASE_URL!;

// Disable prefetch as it is not supported for Node.js 20
const client = postgres(connectionString, { prepare: false });
export const db = drizzle(client, { schema });

// Export schema for easy access
export * from './schema';