import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("categories", "routes/categories.tsx"),
  route("categories/:id", "routes/categories.$id.tsx"),
  route("api/plaid/create-link-token", "routes/api.plaid.create-link-token.ts"),
  route("api/plaid/exchange-token", "routes/api.plaid.exchange-token.ts"),
  route("api/plaid/sync-transactions", "routes/api.plaid.sync-transactions.ts"),
  route("api/accounts", "routes/api.accounts.ts"),
  route("api/transactions", "routes/api.transactions.ts"),
  route("api/transactions/uncategorized", "routes/api.transactions.uncategorized.ts"),
  route("api/transactions/bulk-categorize", "routes/api.transactions.bulk-categorize.ts"),
  route("api/transactions/:id/categorize", "routes/api.transactions.$id.categorize.ts"),
  route("api/transactions/:id/tag-project", "routes/api.transactions.$id.tag-project.ts"),
  route("api/categories", "routes/api.categories.ts"),
  route("api/categories/:id", "routes/api.categories.$id.ts"),
  route("api/projects", "routes/api.projects.ts"),
  route("api/projects/:id", "routes/api.projects.$id.ts"),
] satisfies RouteConfig;
