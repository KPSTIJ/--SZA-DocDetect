import axios from 'axios';

const client = axios.create({
  baseURL: '/api',
  timeout: 10000,
});

let backendWarningShown = false;

client.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.code === 'ERR_NETWORK' && !backendWarningShown) {
      backendWarningShown = true;
      console.warn(
        '%c⚠ Backend unreachable',
        'background:#c43a3a;color:#fff;padding:4px 12px;border-radius:4px;font-weight:600;font-size:13px',
      );
      console.warn(
        '%cStart the backend: python main.py run',
        'background:#1a6b4a;color:#fff;padding:4px 12px;border-radius:4px;font-size:12px',
      );
    }
    const message = error.response?.data?.detail || error.message || 'Unknown error';
    return Promise.reject(error);
  },
);

export default client;
