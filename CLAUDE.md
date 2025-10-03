# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**wantnot** is a financial application with banking integration capabilities. The application loads transaction from connected bank accounts via Plaid API for simple categorization and date aggregation to track spending and help with budgeting tasks.

## Technology Stack

- **Database**: PostgreSQL (hosted on Neon)
- **Banking Integration**: Plaid API for connecting bank accounts
- **Runtime Port**: 4004 (configured in .env)
- **Brand Color**: #41A6AC

## Architecture

- TypeScript Remix / React Router with Bun as the underlying server
- PostgreSQL database hosted on Neon
- Drizzle ORM for database interactions/migration/management
- Firebase Authentication for user management
- Plaid API integration for bank account and transaction data

## Environment Configuration

The project uses environment variables for configuration:
- Database connection to Neon PostgreSQL
- Plaid API credentials for sandbox environment
- Custom port configuration (4004)
- Brand styling variables

## Development Setup

```bash
# Install dependencies
bun install

# Start development server (runs on port 4004)
bun run dev

# Build for production
bun run build

# Start production server
bun run start

# Type checking
bun run typecheck

# Database management
bun run db:generate    # Generate migrations from schema
bun run db:push        # Push schema directly to database
bun run db:studio      # Open Drizzle Studio GUI
```

## Database Schema

### Tables:
- **users**: Links Firebase UID to database records
- **accounts**: Connected bank accounts from Plaid
- **transactions**: Transaction data from Plaid with categorization
- **categories**: Budget categories for spending tracking
- **plaidWebhooks**: Webhook events from Plaid

## Important Notes

- This project handles financial data through Plaid integration
- Database is already configured and ready for connection
- Project runs on port 4004 instead of the typical 3000
- Environment variables are properly configured in .env file

## Security Considerations

Given the financial nature of this application:
- Sensitive API keys are properly stored in .env
- Database connection uses SSL requirements
- Plaid integration requires secure handling of financial data
