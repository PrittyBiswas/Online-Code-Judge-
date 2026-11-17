// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProfilePage } from '../src/pages/ProfilePage';
import { Header } from '../src/components/Header';
import * as usersApi from '../src/services/usersApi';
import * as authContext from '../src/context/AuthContext';
import { Role } from '@judge/shared';

const mockProfile = {
  id: '11111111-1111-4111-8111-111111111111',
  username: 'testcoder',
  email: 'testcoder@example.com',
  role: Role.USER,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  emailVerified: true,
  accountStatus: 'active' as const,
  fullName: 'Test Coder',
  phoneNumber: '+1 555 123 4567',
  avatarUrl: null,
  bio: 'Passionate algorithms enthusiast',
  country: 'United States',
  state: 'California',
  city: 'San Francisco',
  education: 'B.S.',
  college: 'Stanford University',
  degree: 'Computer Science',
  skills: ['TypeScript', 'Rust', 'Docker'],
  githubUrl: 'https://github.com/testcoder',
  linkedinUrl: 'https://linkedin.com/in/testcoder',
  portfolioUrl: 'https://testcoder.dev',
};

describe('User Profile & Settings Frontend Suite', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    vi.spyOn(authContext, 'useAuth').mockReturnValue({
      status: 'authenticated',
      user: {
        id: mockProfile.id,
        username: mockProfile.username,
        email: mockProfile.email,
        role: mockProfile.role,
      },
      bootstrapError: null,
      sessionExpiredMessage: null,
      refreshAuth: vi.fn().mockResolvedValue(undefined),
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn().mockResolvedValue({ serverConfirmed: true }),
      clearSessionMessage: vi.fn(),
    });

    vi.spyOn(usersApi, 'fetchMyProfile').mockResolvedValue({ ...mockProfile });
    vi.spyOn(usersApi, 'updateMyProfile').mockImplementation(async (payload) => ({
      profile: {
        ...mockProfile,
        ...payload,
        skills: payload.skills || mockProfile.skills,
        fullName: payload.fullName ?? null,
      },
      message: 'Profile saved successfully!',
    }));
    vi.spyOn(usersApi, 'uploadAvatar').mockResolvedValue({
      avatarUrl: '/api/users/avatar/avatars%2Fmock-avatar.png',
      message: 'Avatar uploaded successfully',
    });
    vi.spyOn(usersApi, 'deleteAvatar').mockResolvedValue({
      message: 'Avatar removed',
    });
  });

  afterEach(() => {
    cleanup();
  });

  describe('Header "Edit Profile" Option', () => {
    it('displays the User icon and "Edit Profile" link navigating to /profile', () => {
      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <Header apiStatus="online" />
          </MemoryRouter>
        </QueryClientProvider>
      );

      const editProfileLink = screen.getByRole('link', { name: /edit profile/i });
      expect(editProfileLink).toBeDefined();
      expect(editProfileLink.getAttribute('href')).toBe('/profile');
      // Username text is removed from direct view in header
      expect(screen.queryByText(/Signed in as/i)).toBeNull();
    });
  });

  describe('ProfilePage Display and Interaction', () => {
    it('renders loading state initially and then shows user profile data', async () => {
      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <ProfilePage />
          </MemoryRouter>
        </QueryClientProvider>
      );

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Test Coder' })).toBeDefined();
      });

      expect(screen.getAllByText('@testcoder')[0]).toBeDefined();
      expect(screen.getAllByText('testcoder@example.com')[0]).toBeDefined();
      expect(screen.getByText('Stanford University')).toBeDefined();
      expect(screen.getByText('Computer Science')).toBeDefined();
      expect(screen.getByText('TypeScript')).toBeDefined();
      expect(screen.getByText('Rust')).toBeDefined();
      expect(screen.getByText('Docker')).toBeDefined();
      expect(screen.getByText(mockProfile.id)).toBeDefined();
      expect(screen.getByText('ACTIVE')).toBeDefined();
    });

    it('toggles edit mode when "Edit Profile" button is clicked', async () => {
      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <ProfilePage />
          </MemoryRouter>
        </QueryClientProvider>
      );

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Test Coder' })).toBeDefined();
      });

      const editBtn = screen.getByRole('button', { name: /edit profile/i });
      fireEvent.click(editBtn);

      expect(screen.getByText('Editing Mode')).toBeDefined();
      expect(screen.getByRole('button', { name: /save changes/i })).toBeDefined();
      expect(screen.getByRole('button', { name: /cancel/i })).toBeDefined();
    });

    it('cancels edit mode and restores original values', async () => {
      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <ProfilePage />
          </MemoryRouter>
        </QueryClientProvider>
      );

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Test Coder' })).toBeDefined();
      });

      fireEvent.click(screen.getByRole('button', { name: /edit profile/i }));

      const nameInput = screen.getByPlaceholderText('e.g. John Doe') as HTMLInputElement;
      fireEvent.change(nameInput, { target: { value: 'Modified Name' } });
      expect(nameInput.value).toBe('Modified Name');

      fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

      expect(screen.queryByText('Editing Mode')).toBeNull();
      expect(screen.getByRole('heading', { name: 'Test Coder' })).toBeDefined();
    });

    it('saves updated information and shows success confirmation', async () => {
      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <ProfilePage />
          </MemoryRouter>
        </QueryClientProvider>
      );

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Test Coder' })).toBeDefined();
      });

      fireEvent.click(screen.getByRole('button', { name: /edit profile/i }));

      const nameInput = screen.getByPlaceholderText('e.g. John Doe');
      fireEvent.change(nameInput, { target: { value: 'Alice Johnson' } });

      const bioInput = screen.getByPlaceholderText(/Tell other competitors/i);
      fireEvent.change(bioInput, { target: { value: 'New bio about competitive programming' } });

      fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

      await waitFor(() => {
        expect(screen.getByText(/Profile saved successfully!/i)).toBeDefined();
      });

      expect(usersApi.updateMyProfile).toHaveBeenCalledWith(
        expect.objectContaining({
          fullName: 'Alice Johnson',
          bio: 'New bio about competitive programming',
        })
      );
    });

    it('displays validation errors when invalid input is provided', async () => {
      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <ProfilePage />
          </MemoryRouter>
        </QueryClientProvider>
      );

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Test Coder' })).toBeDefined();
      });

      fireEvent.click(screen.getByRole('button', { name: /edit profile/i }));

      const usernameInput = screen.getByPlaceholderText('Username');
      fireEvent.change(usernameInput, { target: { value: 'ab' } }); // < 3 chars

      const emailInput = screen.getByPlaceholderText('email@example.com');
      fireEvent.change(emailInput, { target: { value: 'not-an-email' } });

      fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

      await waitFor(() => {
        expect(screen.getByText(/Username must be between 3 and 30 characters/i)).toBeDefined();
        expect(screen.getByText(/Please enter a valid email address/i)).toBeDefined();
      });

      expect(usersApi.updateMyProfile).not.toHaveBeenCalled();
    });
  });
});
