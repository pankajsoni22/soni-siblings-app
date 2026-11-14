// Public values from .env (VITE_ prefix). The backend enforces access, so none of these are secret.
export const config = {
  appName: import.meta.env.VITE_APP_NAME ?? 'Soni Siblings',
  googleClientId: import.meta.env.VITE_GOOGLE_CLIENT_ID,
  apiUrl: import.meta.env.VITE_API_URL
} as const;
