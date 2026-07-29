const trimTrailingSlash = (value) => value.replace(/\/$/, '');
const ensureLeadingSlash = (value) => value.startsWith('/') ? value : `/${value}`;

const requiredUrl = (name, value) => {
  if (!value) throw new Error(`${name} is required`);
  return trimTrailingSlash(value);
};

export const DATABASE_API_URL = requiredUrl('EXPO_PUBLIC_DATABASE_API_URL', process.env.EXPO_PUBLIC_DATABASE_API_URL);

export const BLOCKCHAIN_API_URL = requiredUrl('EXPO_PUBLIC_BLOCKCHAIN_API_URL', process.env.EXPO_PUBLIC_BLOCKCHAIN_API_URL);

export const databaseUrl = (path) => `${DATABASE_API_URL}${ensureLeadingSlash(path)}`;
export const blockchainUrl = (path) => `${BLOCKCHAIN_API_URL}${ensureLeadingSlash(path)}`;
