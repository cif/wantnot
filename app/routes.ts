import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("categories", "routes/categories.tsx"),
  route("api/plaid/create-link-token", "routes/api.plaid.create-link-token.ts"),
  route("api/plaid/exchange-token", "routes/api.plaid.exchange-token.ts"),
  route("api/plaid/sync-transactions", "routes/api.plaid.sync-transactions.ts"),
  route("api/accounts", "routes/api.accounts.ts"),
  route("api/transactions", "routes/api.transactions.ts"),
  route("api/categories", "routes/api.categories.ts"),
  route("api/categories/:id", "routes/api.categories.$id.ts"),
] satisfies RouteConfig;
