import axios from 'axios';
import Cookies from 'js-cookie';
import type { User } from '@/types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://realtime-chat-app-kmjnrg.fly.dev/api';

const api = axios.create({
  baseURL: API_URL,
  withCredentials: true,
});

api.interceptors.request.use((config) => {
  const token = Cookies.get('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (r) => r,
  (error) => {
    if (error.response?.status === 401) {
      Cookies.remove('token');
      if (typeof window !== 'undefined' && !window.location.pathname.includes('/login')) {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default api;

export const uid = (u?: User | string | null) => {
  if (!u) return '';
  if (typeof u === 'string') return u;
  return (u.id || u._id || '') as string;
};
