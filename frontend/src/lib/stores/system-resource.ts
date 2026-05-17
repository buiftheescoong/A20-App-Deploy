import { create } from 'zustand';
import type { SystemResourceSummary } from '../types';

interface SystemResourceState {
  resources: SystemResourceSummary[];
  isLoading: boolean;

  // Filters
  filterSubject: string;
  filterGrade: string;
  filterCategory: string;
  searchQuery: string;

  setResources: (resources: SystemResourceSummary[]) => void;
  setLoading: (loading: boolean) => void;
  setFilterSubject: (subject: string) => void;
  setFilterGrade: (grade: string) => void;
  setFilterCategory: (category: string) => void;
  setSearchQuery: (query: string) => void;
  resetFilters: () => void;
}

export const useSystemResourceStore = create<SystemResourceState>((set) => ({
  resources: [],
  isLoading: false,
  filterSubject: '',
  filterGrade: '',
  filterCategory: '',
  searchQuery: '',

  setResources: (resources) => set({ resources, isLoading: false }),
  setLoading: (isLoading) => set({ isLoading }),
  setFilterSubject: (filterSubject) => set({ filterSubject }),
  setFilterGrade: (filterGrade) => set({ filterGrade }),
  setFilterCategory: (filterCategory) => set({ filterCategory }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  resetFilters: () => set({ filterSubject: '', filterGrade: '', filterCategory: '', searchQuery: '' }),
}));
