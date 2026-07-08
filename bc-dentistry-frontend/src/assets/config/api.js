const stripTrailingSlash = (value) => value.replace(/\/+$/, "");

const normalizeBaseUrl = (value, fallback) => {
    const baseUrl = value || fallback;
    return stripTrailingSlash(baseUrl);
};

export const DATABASE_API_URL = normalizeBaseUrl(
    import.meta.env.VITE_DATABASE_API_URL,
    "http://localhost:8080"
);

export const BLOCKCHAIN_API_URL = normalizeBaseUrl(
    import.meta.env.VITE_BLOCKCHAIN_API_URL,
    "http://localhost:8081"
);

const buildUrl = (baseUrl, path) => {
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    return `${baseUrl}${normalizedPath}`;
};

export const databaseUrl = (path) => buildUrl(DATABASE_API_URL, path);
export const blockchainUrl = (path) => buildUrl(BLOCKCHAIN_API_URL, path);
