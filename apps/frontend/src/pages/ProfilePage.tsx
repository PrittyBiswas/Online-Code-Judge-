import { useState, useEffect, useRef, type ChangeEvent, type FormEvent } from 'react';
import {
  User,
  Mail,
  MapPin,
  Calendar,
  Shield,
  GraduationCap,
  Globe,
  Github,
  Linkedin,
  CheckCircle,
  AlertCircle,
  Edit2,
  Save,
  X,
  Upload,
  Trash2,
  Copy,
  Check,
  Loader2,
  ExternalLink,
} from 'lucide-react';
import type { UserProfile, UpdateUserProfileInput } from '@judge/shared';
import { useAuth } from '../context/AuthContext';
import { fetchMyProfile, updateMyProfile, uploadAvatar, deleteAvatar } from '../services/usersApi';
import { getApiErrorMessage } from '../services/apiClient';

interface FormErrors {
  username?: string;
  email?: string;
  phoneNumber?: string;
  githubUrl?: string;
  linkedinUrl?: string;
  portfolioUrl?: string;
  avatarUrl?: string;
  general?: string;
}

export function ProfilePage() {
  const { refreshAuth } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Edit mode state
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errors, setErrors] = useState<FormErrors>({});
  const [copiedId, setCopiedId] = useState(false);

  // Form state
  const [formData, setFormData] = useState<UpdateUserProfileInput>({});
  const [skillsInput, setSkillsInput] = useState('');
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);

  // Fetch profile on mount
  useEffect(() => {
    async function loadData() {
      setLoading(true);
      setLoadError(null);
      try {
        const data = await fetchMyProfile();
        setProfile(data);
        syncFormWithProfile(data);
      } catch (err) {
        setLoadError(getApiErrorMessage(err, 'Failed to load profile details'));
      } finally {
        setLoading(false);
      }
    }
    void loadData();
  }, []);

  function syncFormWithProfile(data: UserProfile) {
    setFormData({
      username: data.username,
      email: data.email,
      fullName: data.fullName ?? '',
      phoneNumber: data.phoneNumber ?? '',
      avatarUrl: data.avatarUrl ?? '',
      bio: data.bio ?? '',
      country: data.country ?? '',
      state: data.state ?? '',
      city: data.city ?? '',
      education: data.education ?? '',
      college: data.college ?? '',
      degree: data.degree ?? '',
      skills: data.skills ?? [],
      githubUrl: data.githubUrl ?? '',
      linkedinUrl: data.linkedinUrl ?? '',
      portfolioUrl: data.portfolioUrl ?? '',
    });
    setSkillsInput((data.skills ?? []).join(', '));
    setAvatarPreview(data.avatarUrl);
  }

  function handleStartEditing() {
    if (profile) {
      syncFormWithProfile(profile);
    }
    setErrors({});
    setSuccessMessage(null);
    setErrorMessage(null);
    setIsEditing(true);
  }

  function handleCancelEditing() {
    if (profile) {
      syncFormWithProfile(profile);
    }
    setErrors({});
    setErrorMessage(null);
    setIsEditing(false);
  }

  function handleCopyUserId() {
    if (!profile) return;
    navigator.clipboard.writeText(profile.id).then(() => {
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
    });
  }

  function validate(): boolean {
    const newErrors: FormErrors = {};

    if (formData.username !== undefined) {
      const username = formData.username.trim();
      if (!username) {
        newErrors.username = 'Username is required';
      } else if (username.length < 3 || username.length > 30) {
        newErrors.username = 'Username must be between 3 and 30 characters';
      } else if (!/^[a-zA-Z0-9_]+$/.test(username)) {
        newErrors.username = 'Username can only contain alphanumeric characters and underscores';
      }
    }

    if (formData.email !== undefined) {
      const email = formData.email.trim();
      if (!email) {
        newErrors.email = 'Email address is required';
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        newErrors.email = 'Please enter a valid email address';
      }
    }

    if (formData.phoneNumber) {
      const phone = formData.phoneNumber.trim();
      if (phone && !/^[+]?[0-9\s\-().]{7,25}$/.test(phone)) {
        newErrors.phoneNumber = 'Please enter a valid phone number format (e.g. +1 234 567 8900)';
      }
    }

    function checkUrl(
      url?: string | null,
      fieldName: keyof FormErrors = 'portfolioUrl',
      label = 'URL'
    ) {
      if (!url) return;
      const trimmed = url.trim();
      if (!trimmed) return;
      try {
        const parsed = new URL(trimmed);
        if (!['http:', 'https:'].includes(parsed.protocol)) {
          newErrors[fieldName] = `${label} must use HTTP or HTTPS`;
        }
      } catch {
        newErrors[fieldName] = `Please enter a valid URL (including https://)`;
      }
    }

    checkUrl(formData.githubUrl, 'githubUrl', 'GitHub URL');
    checkUrl(formData.linkedinUrl, 'linkedinUrl', 'LinkedIn URL');
    checkUrl(formData.portfolioUrl, 'portfolioUrl', 'Portfolio URL');

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  async function handleAvatarFileSelect(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      setErrorMessage('Image file size must not exceed 2MB.');
      return;
    }

    // Validate type
    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!validTypes.includes(file.type)) {
      setErrorMessage('Invalid image type. Please select a JPEG, PNG, WebP, or GIF image.');
      return;
    }

    setErrorMessage(null);
    setAvatarUploading(true);

    const reader = new FileReader();
    reader.onload = async () => {
      const base64Data = reader.result as string;
      setAvatarPreview(base64Data);

      try {
        const uploadResult = await uploadAvatar(base64Data);
        setProfile((prev) => (prev ? { ...prev, avatarUrl: uploadResult.avatarUrl } : null));
        setFormData((prev) => ({ ...prev, avatarUrl: uploadResult.avatarUrl }));
        setSuccessMessage('Profile picture updated successfully!');
        await refreshAuth();
      } catch (err) {
        setErrorMessage(getApiErrorMessage(err, 'Failed to upload profile picture.'));
        if (profile?.avatarUrl) {
          setAvatarPreview(profile.avatarUrl);
        } else {
          setAvatarPreview(null);
        }
      } finally {
        setAvatarUploading(false);
      }
    };
    reader.onerror = () => {
      setErrorMessage('Could not read image file.');
      setAvatarUploading(false);
    };
    reader.readAsDataURL(file);
  }

  async function handleRemoveAvatar() {
    setErrorMessage(null);
    setAvatarUploading(true);
    try {
      await deleteAvatar();
      setProfile((prev) => (prev ? { ...prev, avatarUrl: null } : null));
      setFormData((prev) => ({ ...prev, avatarUrl: null }));
      setAvatarPreview(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setSuccessMessage('Profile picture removed.');
      await refreshAuth();
    } catch (err) {
      setErrorMessage(getApiErrorMessage(err, 'Failed to remove profile picture.'));
    } finally {
      setAvatarUploading(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    setSaving(true);
    setSuccessMessage(null);
    setErrorMessage(null);

    // Parse comma separated skills
    const parsedSkills = skillsInput
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    const payload: UpdateUserProfileInput = {
      ...formData,
      username: formData.username?.trim(),
      email: formData.email?.trim().toLowerCase(),
      fullName: formData.fullName?.trim() || null,
      phoneNumber: formData.phoneNumber?.trim() || null,
      bio: formData.bio?.trim() || null,
      country: formData.country?.trim() || null,
      state: formData.state?.trim() || null,
      city: formData.city?.trim() || null,
      education: formData.education?.trim() || null,
      college: formData.college?.trim() || null,
      degree: formData.degree?.trim() || null,
      skills: parsedSkills,
      githubUrl: formData.githubUrl?.trim() || null,
      linkedinUrl: formData.linkedinUrl?.trim() || null,
      portfolioUrl: formData.portfolioUrl?.trim() || null,
    };

    try {
      const response = await updateMyProfile(payload);
      setProfile(response.profile);
      syncFormWithProfile(response.profile);
      setIsEditing(false);
      setSuccessMessage(response.message || 'Profile saved successfully!');
      await refreshAuth();
    } catch (err) {
      const msg = getApiErrorMessage(err, 'Failed to save profile changes.');
      setErrorMessage(msg);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-400" />
          <p className="text-sm text-slate-400">Loading your profile details...</p>
        </div>
      </div>
    );
  }

  if (loadError || !profile) {
    return (
      <div className="mx-auto max-w-xl rounded-xl border border-red-500/30 bg-red-500/10 p-6 text-center">
        <AlertCircle className="mx-auto h-10 w-10 text-red-400" />
        <h2 className="mt-3 text-lg font-bold text-white">Unable to Load Profile</h2>
        <p className="mt-1 text-sm text-red-200">{loadError || 'User profile not found.'}</p>
        <button
          onClick={() => window.location.reload()}
          className="mt-4 rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-red-500"
        >
          Try Again
        </button>
      </div>
    );
  }

  const initials = (profile.fullName || profile.username || 'U').slice(0, 2).toUpperCase();

  return (
    <div className="space-y-6">
      {/* Top Banner & Title Bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
            User Profile & Settings
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Manage your personal profile, professional details, and account credentials.
          </p>
        </div>

        <div>
          {!isEditing ? (
            <button
              type="button"
              onClick={handleStartEditing}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-400"
            >
              <Edit2 className="h-4 w-4" />
              <span>Edit Profile</span>
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCancelEditing}
                disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3.5 py-2 text-sm font-medium text-slate-200 transition hover:bg-slate-700 disabled:opacity-50"
              >
                <X className="h-4 w-4" />
                <span>Cancel</span>
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:opacity-50"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                <span>{saving ? 'Saving...' : 'Save Changes'}</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Notifications / Alerts */}
      {successMessage && (
        <div
          role="status"
          className="flex items-center gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/15 p-4 text-sm text-emerald-200 shadow-sm"
        >
          <CheckCircle className="h-5 w-5 shrink-0 text-emerald-400" />
          <span>{successMessage}</span>
          <button
            onClick={() => setSuccessMessage(null)}
            className="ml-auto text-emerald-400 hover:text-emerald-300"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {errorMessage && (
        <div
          role="alert"
          className="flex items-center gap-3 rounded-lg border border-red-500/30 bg-red-500/15 p-4 text-sm text-red-200 shadow-sm"
        >
          <AlertCircle className="h-5 w-5 shrink-0 text-red-400" />
          <span>{errorMessage}</span>
          <button
            onClick={() => setErrorMessage(null)}
            className="ml-auto text-red-400 hover:text-red-300"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Main Grid: Left Sidebar & Right Content */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left Column: Avatar & Summary Card */}
        <div className="space-y-6 lg:col-span-1">
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6 shadow-sm">
            <div className="flex flex-col items-center text-center">
              {/* Avatar View / Upload Area */}
              <div className="relative group">
                {avatarPreview ? (
                  <img
                    src={avatarPreview}
                    alt={profile.username}
                    className="h-28 w-28 rounded-full border-2 border-indigo-500/40 object-cover shadow-inner"
                  />
                ) : (
                  <div className="flex h-28 w-28 items-center justify-center rounded-full border-2 border-slate-700 bg-gradient-to-tr from-indigo-900/40 to-slate-800 text-2xl font-bold tracking-wider text-indigo-300 shadow-inner">
                    {initials}
                  </div>
                )}

                {avatarUploading && (
                  <div className="absolute inset-0 flex items-center justify-center rounded-full bg-slate-900/75">
                    <Loader2 className="h-6 w-6 animate-spin text-indigo-400" />
                  </div>
                )}
              </div>

              {/* Avatar Actions */}
              <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleAvatarFileSelect}
                  accept="image/png, image/jpeg, image/webp, image/gif"
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={avatarUploading}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:bg-slate-700 disabled:opacity-50"
                  title="Upload profile picture (Max 2MB)"
                >
                  <Upload className="h-3.5 w-3.5 text-indigo-400" />
                  <span>{avatarPreview ? 'Replace Image' : 'Upload Image'}</span>
                </button>

                {avatarPreview && (
                  <button
                    type="button"
                    onClick={handleRemoveAvatar}
                    disabled={avatarUploading}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-300 transition hover:bg-red-500/20 disabled:opacity-50"
                    title="Remove picture"
                  >
                    <Trash2 className="h-3.5 w-3.5 text-red-400" />
                    <span>Remove</span>
                  </button>
                )}
              </div>
              <p className="mt-2 text-xs text-slate-500">
                Supports JPG, PNG, WebP or GIF up to 2MB.
              </p>

              {/* User Identity */}
              <h2 className="mt-5 text-xl font-bold text-white">
                {profile.fullName || profile.username}
              </h2>
              <p className="text-xs text-slate-400">@{profile.username}</p>

              {/* Role & Status Badges */}
              <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-full border border-indigo-500/30 bg-indigo-500/15 px-2.5 py-0.5 text-xs font-medium text-indigo-300">
                  <Shield className="h-3 w-3" />
                  {profile.role.toUpperCase()}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/15 px-2.5 py-0.5 text-xs font-medium text-emerald-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  {profile.accountStatus.toUpperCase()}
                </span>
              </div>
            </div>

            {/* Quick Summary Info */}
            <div className="mt-6 border-t border-slate-800/80 pt-5 space-y-3 text-xs text-slate-300">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-slate-400">
                  <Mail className="h-3.5 w-3.5 text-slate-500" />
                  Email
                </span>
                <span className="font-mono text-slate-200 truncate max-w-[180px]">
                  {profile.email}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-slate-400">
                  <Calendar className="h-3.5 w-3.5 text-slate-500" />
                  Member Since
                </span>
                <span className="text-slate-200">
                  {new Date(profile.createdAt).toLocaleDateString(undefined, {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                  })}
                </span>
              </div>

              {(profile.country || profile.city) && (
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-slate-400">
                    <MapPin className="h-3.5 w-3.5 text-slate-500" />
                    Location
                  </span>
                  <span className="text-slate-200">
                    {[profile.city, profile.country].filter(Boolean).join(', ')}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Columns: Main Information Cards */}
        <div className="space-y-6 lg:col-span-2">
          {/* Card 1: Personal Information */}
          <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-6 shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-2">
                <User className="h-5 w-5 text-indigo-400" />
                <h3 className="text-base font-semibold text-white">Personal Information</h3>
              </div>
              {isEditing && (
                <span className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded">
                  Editing Mode
                </span>
              )}
            </div>

            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
              {/* Full Name */}
              <div>
                <label className="block text-xs font-medium text-slate-400">Full Name</label>
                {isEditing ? (
                  <input
                    type="text"
                    value={formData.fullName ?? ''}
                    onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                    placeholder="e.g. John Doe"
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800/90 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                ) : (
                  <p className="mt-1 text-sm font-medium text-slate-200">
                    {profile.fullName || <span className="italic text-slate-500">Not set</span>}
                  </p>
                )}
              </div>

              {/* Username */}
              <div>
                <label className="block text-xs font-medium text-slate-400">
                  Username <span className="text-red-400">*</span>
                </label>
                {isEditing ? (
                  <div>
                    <input
                      type="text"
                      value={formData.username ?? ''}
                      onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                      placeholder="Username"
                      className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800/90 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                    {errors.username && (
                      <p className="mt-1 text-xs text-red-400">{errors.username}</p>
                    )}
                  </div>
                ) : (
                  <p className="mt-1 text-sm font-mono font-medium text-slate-200">
                    @{profile.username}
                  </p>
                )}
              </div>

              {/* Email Address */}
              <div>
                <label className="block text-xs font-medium text-slate-400">
                  Email Address <span className="text-red-400">*</span>
                </label>
                {isEditing ? (
                  <div>
                    <input
                      type="email"
                      value={formData.email ?? ''}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      placeholder="email@example.com"
                      className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800/90 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                    {errors.email && <p className="mt-1 text-xs text-red-400">{errors.email}</p>}
                  </div>
                ) : (
                  <p className="mt-1 text-sm font-mono text-slate-200">{profile.email}</p>
                )}
              </div>

              {/* Phone Number */}
              <div>
                <label className="block text-xs font-medium text-slate-400">Phone Number</label>
                {isEditing ? (
                  <div>
                    <input
                      type="tel"
                      value={formData.phoneNumber ?? ''}
                      onChange={(e) => setFormData({ ...formData, phoneNumber: e.target.value })}
                      placeholder="+1 (555) 000-0000"
                      className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800/90 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                    {errors.phoneNumber && (
                      <p className="mt-1 text-xs text-red-400">{errors.phoneNumber}</p>
                    )}
                  </div>
                ) : (
                  <p className="mt-1 text-sm text-slate-200">
                    {profile.phoneNumber || <span className="italic text-slate-500">Not set</span>}
                  </p>
                )}
              </div>

              {/* Country */}
              <div>
                <label className="block text-xs font-medium text-slate-400">Country</label>
                {isEditing ? (
                  <input
                    type="text"
                    value={formData.country ?? ''}
                    onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                    placeholder="e.g. United States"
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800/90 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                ) : (
                  <p className="mt-1 text-sm text-slate-200">
                    {profile.country || <span className="italic text-slate-500">Not set</span>}
                  </p>
                )}
              </div>

              {/* State & City */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-slate-400">State / Region</label>
                  {isEditing ? (
                    <input
                      type="text"
                      value={formData.state ?? ''}
                      onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                      placeholder="e.g. California"
                      className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800/90 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  ) : (
                    <p className="mt-1 text-sm text-slate-200">
                      {profile.state || <span className="italic text-slate-500">Not set</span>}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400">City</label>
                  {isEditing ? (
                    <input
                      type="text"
                      value={formData.city ?? ''}
                      onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                      placeholder="e.g. San Francisco"
                      className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800/90 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  ) : (
                    <p className="mt-1 text-sm text-slate-200">
                      {profile.city || <span className="italic text-slate-500">Not set</span>}
                    </p>
                  )}
                </div>
              </div>

              {/* Bio / About Me */}
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-400">Bio / About Me</label>
                {isEditing ? (
                  <textarea
                    rows={3}
                    value={formData.bio ?? ''}
                    onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                    placeholder="Tell other competitors a little about yourself, your goals, or your passions..."
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800/90 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                ) : (
                  <p className="mt-1 text-sm leading-relaxed text-slate-300">
                    {profile.bio || (
                      <span className="italic text-slate-500">
                        No bio provided yet. Click Edit Profile to tell others about yourself!
                      </span>
                    )}
                  </p>
                )}
              </div>
            </div>
          </section>

          {/* Card 2: Professional Information */}
          <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-6 shadow-sm">
            <div className="flex items-center gap-2 border-b border-slate-800 pb-4">
              <GraduationCap className="h-5 w-5 text-indigo-400" />
              <h3 className="text-base font-semibold text-white">
                Professional & Academic Information
              </h3>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
              {/* Education Level */}
              <div>
                <label className="block text-xs font-medium text-slate-400">Education Level</label>
                {isEditing ? (
                  <input
                    type="text"
                    value={formData.education ?? ''}
                    onChange={(e) => setFormData({ ...formData, education: e.target.value })}
                    placeholder="e.g. Undergraduate, Graduate, Bootcamp"
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800/90 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                ) : (
                  <p className="mt-1 text-sm text-slate-200">
                    {profile.education || <span className="italic text-slate-500">Not set</span>}
                  </p>
                )}
              </div>

              {/* College / University */}
              <div>
                <label className="block text-xs font-medium text-slate-400">
                  College / University
                </label>
                {isEditing ? (
                  <input
                    type="text"
                    value={formData.college ?? ''}
                    onChange={(e) => setFormData({ ...formData, college: e.target.value })}
                    placeholder="e.g. Stanford University"
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800/90 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                ) : (
                  <p className="mt-1 text-sm text-slate-200">
                    {profile.college || <span className="italic text-slate-500">Not set</span>}
                  </p>
                )}
              </div>

              {/* Degree */}
              <div>
                <label className="block text-xs font-medium text-slate-400">Degree / Major</label>
                {isEditing ? (
                  <input
                    type="text"
                    value={formData.degree ?? ''}
                    onChange={(e) => setFormData({ ...formData, degree: e.target.value })}
                    placeholder="e.g. B.S. Computer Science"
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800/90 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                ) : (
                  <p className="mt-1 text-sm text-slate-200">
                    {profile.degree || <span className="italic text-slate-500">Not set</span>}
                  </p>
                )}
              </div>

              {/* Skills */}
              <div>
                <label className="block text-xs font-medium text-slate-400">
                  Skills / Languages
                </label>
                {isEditing ? (
                  <div>
                    <input
                      type="text"
                      value={skillsInput}
                      onChange={(e) => setSkillsInput(e.target.value)}
                      placeholder="e.g. TypeScript, React, Python, C++, Docker"
                      className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800/90 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                    <p className="mt-1 text-[11px] text-slate-500">Comma-separated values</p>
                  </div>
                ) : (
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {profile.skills && profile.skills.length > 0 ? (
                      profile.skills.map((skill, idx) => (
                        <span
                          key={idx}
                          className="rounded-md border border-slate-700 bg-slate-800 px-2 py-0.5 text-xs text-indigo-300 font-medium"
                        >
                          {skill}
                        </span>
                      ))
                    ) : (
                      <span className="italic text-slate-500 text-sm">No skills added</span>
                    )}
                  </div>
                )}
              </div>

              {/* GitHub Profile URL */}
              <div>
                <label className="block text-xs font-medium text-slate-400">
                  GitHub Profile URL
                </label>
                {isEditing ? (
                  <div>
                    <input
                      type="url"
                      value={formData.githubUrl ?? ''}
                      onChange={(e) => setFormData({ ...formData, githubUrl: e.target.value })}
                      placeholder="https://github.com/username"
                      className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800/90 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                    {errors.githubUrl && (
                      <p className="mt-1 text-xs text-red-400">{errors.githubUrl}</p>
                    )}
                  </div>
                ) : profile.githubUrl ? (
                  <a
                    href={profile.githubUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 inline-flex items-center gap-1.5 text-sm text-indigo-400 hover:text-indigo-300 underline font-mono"
                  >
                    <Github className="h-3.5 w-3.5" />
                    <span>{profile.githubUrl.replace(/^https?:\/\//, '')}</span>
                    <ExternalLink className="h-3 w-3" />
                  </a>
                ) : (
                  <p className="mt-1 text-sm italic text-slate-500">Not set</p>
                )}
              </div>

              {/* LinkedIn Profile URL */}
              <div>
                <label className="block text-xs font-medium text-slate-400">
                  LinkedIn Profile URL
                </label>
                {isEditing ? (
                  <div>
                    <input
                      type="url"
                      value={formData.linkedinUrl ?? ''}
                      onChange={(e) => setFormData({ ...formData, linkedinUrl: e.target.value })}
                      placeholder="https://linkedin.com/in/username"
                      className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800/90 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                    {errors.linkedinUrl && (
                      <p className="mt-1 text-xs text-red-400">{errors.linkedinUrl}</p>
                    )}
                  </div>
                ) : profile.linkedinUrl ? (
                  <a
                    href={profile.linkedinUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 inline-flex items-center gap-1.5 text-sm text-indigo-400 hover:text-indigo-300 underline font-mono"
                  >
                    <Linkedin className="h-3.5 w-3.5" />
                    <span>{profile.linkedinUrl.replace(/^https?:\/\//, '')}</span>
                    <ExternalLink className="h-3 w-3" />
                  </a>
                ) : (
                  <p className="mt-1 text-sm italic text-slate-500">Not set</p>
                )}
              </div>

              {/* Portfolio Website URL */}
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-400">
                  Portfolio Website
                </label>
                {isEditing ? (
                  <div>
                    <input
                      type="url"
                      value={formData.portfolioUrl ?? ''}
                      onChange={(e) => setFormData({ ...formData, portfolioUrl: e.target.value })}
                      placeholder="https://myportfolio.dev"
                      className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800/90 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                    {errors.portfolioUrl && (
                      <p className="mt-1 text-xs text-red-400">{errors.portfolioUrl}</p>
                    )}
                  </div>
                ) : profile.portfolioUrl ? (
                  <a
                    href={profile.portfolioUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 inline-flex items-center gap-1.5 text-sm text-indigo-400 hover:text-indigo-300 underline font-mono"
                  >
                    <Globe className="h-3.5 w-3.5" />
                    <span>{profile.portfolioUrl}</span>
                    <ExternalLink className="h-3 w-3" />
                  </a>
                ) : (
                  <p className="mt-1 text-sm italic text-slate-500">Not set</p>
                )}
              </div>
            </div>
          </section>

          {/* Card 3: Account Information (Read-Only) */}
          <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-6 shadow-sm">
            <div className="flex items-center gap-2 border-b border-slate-800 pb-4">
              <Shield className="h-5 w-5 text-indigo-400" />
              <h3 className="text-base font-semibold text-white">Account Information</h3>
              <span className="ml-auto text-xs text-slate-500 bg-slate-800/80 px-2 py-0.5 rounded border border-slate-700">
                System Managed & Read-Only
              </span>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
              {/* User ID */}
              <div>
                <label className="block text-xs font-medium text-slate-400">User ID</label>
                <div className="mt-1 flex items-center gap-2">
                  <span className="font-mono text-xs text-slate-300 bg-slate-800 px-2 py-1 rounded border border-slate-700">
                    {profile.id}
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyUserId}
                    className="text-slate-400 hover:text-slate-200 transition"
                    title="Copy User ID"
                  >
                    {copiedId ? (
                      <Check className="h-4 w-4 text-emerald-400" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* Account Role */}
              <div>
                <label className="block text-xs font-medium text-slate-400">Account Role</label>
                <p className="mt-1 text-sm font-medium text-slate-200 capitalize">{profile.role}</p>
              </div>

              {/* Account Creation Date */}
              <div>
                <label className="block text-xs font-medium text-slate-400">Account Created</label>
                <p className="mt-1 text-sm text-slate-200">
                  {new Date(profile.createdAt).toLocaleString()}
                </p>
              </div>

              {/* Last Profile Update */}
              <div>
                <label className="block text-xs font-medium text-slate-400">Last Updated</label>
                <p className="mt-1 text-sm text-slate-200">
                  {new Date(profile.updatedAt).toLocaleString()}
                </p>
              </div>

              {/* Email Verification Status */}
              <div>
                <label className="block text-xs font-medium text-slate-400">
                  Email Verification Status
                </label>
                <div className="mt-1 inline-flex items-center gap-1.5 text-xs font-medium text-emerald-300">
                  <CheckCircle className="h-4 w-4 text-emerald-400" />
                  <span>Verified</span>
                </div>
              </div>

              {/* Account Status */}
              <div>
                <label className="block text-xs font-medium text-slate-400">Account Status</label>
                <div className="mt-1 inline-flex items-center gap-1.5 text-xs font-medium text-emerald-300">
                  <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span>Active</span>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
export default ProfilePage;
