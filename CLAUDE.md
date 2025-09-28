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

- TypeScript Remix / React Router with Bun as the underlying server.
- PostgreSQL database hosted on Neon
- Prisma ORM for database interactions/migration/management

## Environment Configuration

The project uses environment variables for configuration:
- Database connection to Neon PostgreSQL
- Plaid API credentials for sandbox environment
- Custom port configuration (4004)
- Brand styling variables

## Development Setup

The project currently needs initial scaffolding. Based on the developer's patterns from other projects, typical setup would include:

```bash
# Initialize the project (when package.json exists)
npm install

# Start development server (typical pattern)
npm run dev

# Build for production (typical pattern)
npm run build

# Run linting (typical pattern)
npm run lint
```

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
