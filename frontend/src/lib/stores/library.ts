import { create } from 'zustand';
import type { Plan } from '../types';

interface LibraryState {
  plans: Plan[];
  total: number;
  page: number;
  isLoading: boolean;

  // Filters
  filterSubject: string;
  filterGrade: string;
  sort: 'newest' | 'oldest';

  setPlans: (plans: Plan[], total: number) => void;
  setPage: (page: number) => void;
  setLoading: (loading: boolean) => void;
  removePlan: (id: string) => void;
  setFilterSubject: (subject: string) => void;
  setFilterGrade: (grade: string) => void;
  setSort: (sort: 'newest' | 'oldest') => void;
  resetFilters: () => void;
}

export const useLibraryStore = create<LibraryState>((set) => ({
  plans: [],
  total: 0,
  page: 1,
  isLoading: false,
  filterSubject: '',
  filterGrade: '',
  sort: 'newest',

  setPlans: (plans, total) => set({ plans, total, isLoading: false }),
  setPage: (page) => set({ page }),
  setLoading: (isLoading) => set({ isLoading }),
  removePlan: (id) => set((s) => ({
    plans: s.plans.filter((p) => p.id !== id),
    total: s.total - 1,
  })),
  setFilterSubject: (filterSubject) => set({ filterSubject, page: 1 }),
  setFilterGrade: (filterGrade) => set({ filterGrade, page: 1 }),
  setSort: (sort) => set({ sort, page: 1 }),
  resetFilters: () => set({ filterSubject: '', filterGrade: '', sort: 'newest', page: 1 }),
}));
