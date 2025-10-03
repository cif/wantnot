import { PlaidApi, Configuration, PlaidEnvironments } from 'plaid';

const configuration = new Configuration({
  basePath: PlaidEnvironments.production,
  baseOptions: {
    headers: {
      'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID!,
      'PLAID-SECRET': process.env.PLAID_KEY_PROD!,
    },
  },
});

export const plaidClient = new PlaidApi(configuration);

// Helper to determine environment
export const getPlaidEnvironment = () => {
  if (process.env.NODE_ENV === 'production') {
    return PlaidEnvironments.production;
  }
  return PlaidEnvironments.sandbox;
};

// Helper to get the correct Plaid secret key
export const getPlaidSecret = () => {
  if (process.env.NODE_ENV === 'production') {
    return process.env.PLAID_KEY_PROD!;
  }
  return process.env.PLAID_KEY_SANDBOX!;
};