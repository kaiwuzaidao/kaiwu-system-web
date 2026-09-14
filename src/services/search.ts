import { apiRequest } from '@/services/auth';

export type SearchItem = {
  type: 'PROJECT' | 'USER' | 'DELIVERY';
  id: string;
  title: string;
  subtitle: string;
  path: string;
};

export function globalSearch(query: string) {
  return apiRequest<SearchItem[]>(`/api/search?q=${encodeURIComponent(query)}`);
}
