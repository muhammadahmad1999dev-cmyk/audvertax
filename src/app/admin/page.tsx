"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  FileText,
  LockKeyhole,
  Loader2,
  Menu,
  Settings,
  Upload,
  Users,
  UserPlus,
  KeyRound,
  LogOut,
  X,
  ExternalLink,
} from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  deleteAdminDocument,
  getAdminDocumentDownloadUrl,
  getAdminApplication,
  getAdminApplications,
  getAdminUsers,
  updateAdminApplicationStatus,
  updateAdminPaymentStatus,
  type AdminApplicationDetail,
  type AdminPaymentState,
  type ApplicationDocument,
  login,
  uploadAdminDocument,
} from "@/lib/api";
import {
  AdminSecurityView,
  AdminUsersView,
  StaffManagementView,
} from "@/components/admin/AdminOperations";
import { confirmToast, showToast } from "@/lib/toast";

const adminStatuses = ["submitted", "processing", "completed", "cancelled"] as const;
const paymentStatuses = ["pending", "paid", "refunded"] as const;

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(value),
  );
}
function displayStatus(status: string) {
  return status.replaceAll("_", " ").replace(/\b\w/g, (m) => m.toUpperCase());
}
function countryOf(app: any) {
  const data = app.data ?? {};
  return String(
    data.country ?? data.countryName ?? data.formationState ?? data.jurisdiction ?? "—",
  );
}

function humanizeKey(key: string) {
  return key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function formatValue(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value) || typeof value === "object") return null;
  return String(value);
}

function MembersPanel({ members }: { members: unknown }) {
  if (!Array.isArray(members) || !members.length) return null;
  return (
    <div className="rounded-fm-lg border border-fm-border overflow-hidden">
      <div className="border-b border-fm-border bg-fm-surface-raised p-4">
        <p className="fm-label">LLC members</p>
      </div>
      <div className="divide-y divide-fm-border-soft">
        {members.map((member, index) => {
          const item =
            member && typeof member === "object" ? (member as Record<string, unknown>) : {};
          return (
            <div key={String(item.id ?? index)} className="p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm font-semibold">
                  Member {index + 1}: {String(item.name ?? "Unnamed member")}
                </p>
                <span className="rounded-full border border-fm-border px-2.5 py-1 text-xs font-medium">
                  {String(item.percentage ?? "0")}% ownership
                </span>
              </div>
              <p className="mt-3 text-sm text-fm-text-secondary">
                Date of birth:{" "}
                <span className="text-fm-text-primary">{String(item.dob ?? "—")}</span>
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function normalizeDocumentRole(key: string): "owner" | "member" | "staff" | "admin" | "customer" | null {
  const normalizedKey = key.toLowerCase();

  if (normalizedKey.includes("owner")) return "owner";
  if (normalizedKey.includes("member") || normalizedKey === "members") return "member";
  if (normalizedKey.includes("staff") || normalizedKey === "staffuploads") return "staff";
  if (normalizedKey.includes("admin")) return "admin";
  if (normalizedKey.includes("customer")) return "customer";

  return null;
}

function flattenRoleDocuments(value: unknown, role: "owner" | "member" | "staff" | "admin" | "customer"): ApplicationDocument[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => flattenRoleDocuments(item, role));
  }

  if (!value || typeof value !== "object") {
    return [];
  }

  const item = value as Record<string, unknown>;
  const isFileLike = typeof item.path === "string" && (typeof item.id === "string" || typeof item.name === "string" || typeof item.type === "string");

  if (isFileLike) {
    return [{
      id: typeof item.id === "string" ? item.id : undefined,
      path: typeof item.path === "string" ? item.path : undefined,
      url: typeof item.url === "string" ? item.url : null,
      name: typeof item.name === "string" ? item.name : undefined,
      documentName: typeof item.documentName === "string" ? item.documentName : typeof item.name === "string" ? item.name : undefined,
      size: typeof item.size === "number" ? item.size : undefined,
      type: typeof item.type === "string" ? item.type : undefined,
      uploadedAt: typeof item.uploadedAt === "string" ? item.uploadedAt : undefined,
      uploadedBy: typeof item.uploadedByName === "string" ? item.uploadedByName : undefined,
      uploadedByRole: typeof item.uploadedByRole === "string" ? item.uploadedByRole : role,
      category: role,
    }];
  }

  return Object.entries(item).flatMap(([key, child]) => {
    const nextRole = normalizeDocumentRole(key) ?? role;
    return flattenRoleDocuments(child, nextRole);
  });
}

function buildRoleDocumentGroups(application: AdminApplicationDetail["application"]) {
  const root = (application as { documents?: Record<string, unknown> }).documents ?? (application as { data?: { documents?: Record<string, unknown> } }).data?.documents ?? {};
  const groups: Array<{ key: string; title: string; documents: ApplicationDocument[] }> = [];

  Object.entries(root).forEach(([key, value]) => {
    const role = normalizeDocumentRole(key) ?? "customer";

    if (role === "member") {
      if (Array.isArray(value)) {
        value.forEach((member, index) => {
          const documents = flattenRoleDocuments(member, "member");
          if (documents.length) {
            groups.push({ key: `member-${index + 1}`, title: `Member ${index + 1} documents`, documents });
          }
        });
        return;
      }

      const documents = flattenRoleDocuments(value, "member");
      if (documents.length) {
        groups.push({ key: "member-documents", title: "Member documents", documents });
      }
      return;
    }

    const documents = flattenRoleDocuments(value, role);
    if (documents.length) {
      const title = role.charAt(0).toUpperCase() + role.slice(1) + " documents";
      groups.push({ key: role, title, documents });
    }
  });

  return groups;
}

function DocumentCard({ title, documents, onRemoveDocument, applicationId }: { title: string; documents: ApplicationDocument[]; applicationId: string; onRemoveDocument?: (document: ApplicationDocument) => void }) {
  return (
    <section className="rounded-fm-xl border border-fm-border-soft bg-fm-surface p-3 shadow-[0_8px_20px_rgba(15,23,42,0.04)] md:p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-fm-text-primary">{title}</p>
        <span className="rounded-full border border-fm-border-soft bg-fm-surface-raised px-2 py-1 text-[10px] font-medium uppercase tracking-[0.08em] text-fm-text-secondary">
          {documents.length} file{documents.length === 1 ? "" : "s"}
        </span>
      </div>

      {documents.length ? (
        <div className="space-y-2">
          {documents.map((document, index) => {
            const name = document.documentName ?? document.name ?? document.path?.split("/").pop() ?? "Uploaded document";
            return (
              <div key={`${document.path ?? document.url ?? "document"}-${index}`} className="flex items-center justify-between gap-2 rounded-fm-lg border border-fm-border-soft bg-fm-surface-raised px-3 py-2.5 transition hover:border-fm-lime hover:bg-fm-surface">
                <a
                  href={getAdminDocumentDownloadUrl(applicationId, document.id ?? document.path ?? document.name ?? document.documentName ?? "")}
                  download={document.name ?? document.documentName ?? true}
                  target="_blank"
                  rel="noreferrer"
                  className="flex min-w-0 flex-1 items-center justify-between gap-3 text-sm text-fm-text-primary"
                >
                  <span className="min-w-0 flex-1 break-all text-[13px] leading-snug font-medium">{name}</span>
                  <ExternalLink size={16} className="shrink-0 text-fm-text-secondary" />
                </a>

                {onRemoveDocument && (
                  <button
                    type="button"
                    onClick={() => onRemoveDocument(document)}
                    className="shrink-0 rounded-fm-md border border-fm-danger/30 bg-fm-danger/5 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-fm-danger transition hover:bg-fm-danger/10"
                  >
                    Remove
                  </button>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-xs text-fm-text-secondary">No documents uploaded.</p>
      )}
    </section>
  );
}

function ReadableData({ value, skipKeys = [] }: { value: unknown; skipKeys?: string[] }) {
  if (Array.isArray(value)) {
    return (
      <div className="divide-y divide-fm-border-soft">
        {value.map((item, index) => (
          <div key={index} className="p-4">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-fm-text-tertiary">
              Item {index + 1}
            </p>
            <ReadableData value={item} />
          </div>
        ))}
      </div>
    );
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).filter(
      ([key]) => !skipKeys.includes(key),
    );
    return (
      <div className="divide-y divide-fm-border-soft">
        {entries.map(([key, item]) => {
          const scalar = formatValue(item);
          return (
            <div
              key={key}
              className="grid gap-1 p-4 sm:grid-cols-[minmax(150px,0.7fr)_1fr] sm:gap-5"
            >
              <p className="text-xs font-semibold text-fm-text-secondary">{humanizeKey(key)}</p>
              <div className="min-w-0 text-sm text-fm-text-primary">
                {scalar !== null ? (
                  <p className="break-words whitespace-pre-wrap">{scalar}</p>
                ) : (
                  <div className="overflow-hidden rounded-fm-md border border-fm-border-soft bg-fm-graphite-deep">
                    <ReadableData value={item} skipKeys={skipKeys} />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return <p className="p-4 text-sm">{formatValue(value) ?? "—"}</p>;
}

function AdminLogin() {
  const { setAuthenticatedUser, logout } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginRole, setLoginRole] = useState<"admin" | "staff">("admin");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const response = await login(email, password, loginRole);
      if (response.data.user.role !== loginRole) {
        await logout();
        setError(`This account does not have ${loginRole === "admin" ? "admin" : "employee"} access.`);
        return;
      }
      setAuthenticatedUser(response.data.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to sign in.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-fm-graphite-deep px-4 py-10 text-fm-text-primary sm:px-6">
      <div className="w-full max-w-[440px]">
        <div className="mb-8 flex items-center justify-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-fm-md bg-fm-lime text-xl font-bold text-fm-graphite-deep">
            A
          </div>
          <div>
            <p className="text-2xl font-semibold tracking-tight">Audvertax</p>
            <p className="fm-label mt-0.5">Admin control center</p>
          </div>
        </div>

        <section className="rounded-fm-xl border border-fm-border bg-fm-surface p-6 shadow-fm-elevated sm:p-8">
          <div className="mb-7">
            <div className="mb-4 flex size-10 items-center justify-center rounded-fm-md bg-fm-lime-soft text-fm-lime">
              <LockKeyhole size={20} />
            </div>
            <p className="fm-label">Restricted access</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">Admin sign in</h1>
            <p className="mt-2 text-sm leading-6 text-fm-text-secondary">
              Choose your staff role, then sign in to manage customer applications.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid grid-cols-2 gap-2 rounded-fm-md bg-fm-graphite-deep p-1">
              {([
                ["admin", "Admin"],
                ["staff", "Employee"],
              ] as const).map(([role, label]) => (
                <button
                  key={role}
                  type="button"
                  onClick={() => {
                    setLoginRole(role);
                    setError("");
                  }}
                  className={[
                    "h-10 rounded-fm-sm text-sm font-semibold transition-colors",
                    loginRole === role
                      ? "bg-fm-lime text-fm-graphite-deep"
                      : "text-fm-text-secondary hover:text-fm-text-primary",
                  ].join(" ")}
                >
                  {label}
                </button>
              ))}
            </div>

            <label className="block text-sm font-medium">
              Email address
              <input
                required
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="admin@example.com"
                autoComplete="username"
                className="mt-2 h-11 w-full rounded-fm-md border border-fm-border bg-fm-graphite-deep px-3 text-sm outline-none transition-colors placeholder:text-fm-text-tertiary focus:border-fm-lime"
              />
            </label>

            <label className="block text-sm font-medium">
              Password
              <input
                required
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Enter your password"
                autoComplete="current-password"
                className="mt-2 h-11 w-full rounded-fm-md border border-fm-border bg-fm-graphite-deep px-3 text-sm outline-none transition-colors placeholder:text-fm-text-tertiary focus:border-fm-lime"
              />
            </label>

            {error && (
              <p role="alert" className="rounded-fm-md border border-fm-danger/30 bg-fm-danger-soft p-3 text-sm text-fm-danger">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-fm-md bg-fm-lime text-sm font-semibold text-fm-graphite-deep transition-colors hover:bg-fm-lime-bright disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting && <Loader2 size={16} className="animate-spin" />}
              {submitting
                ? "Signing in..."
                : `Sign in as ${loginRole === "admin" ? "admin" : "employee"}`}
            </button>
          </form>
        </section>

        <p className="mt-5 text-center text-xs text-fm-text-tertiary">
          Authorized Audvertax staff only
        </p>
      </div>
    </main>
  );
}

export default function AdminPage() {
  const router = useRouter();
  const { user, loading: authLoading, logout } = useAuth();
  const [apps, setApps] = useState<any[]>([]);
  const [selected, setSelected] = useState<AdminApplicationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [serviceFilter, setServiceFilter] = useState("all");
  const [countryFilter, setCountryFilter] = useState("all");
  const [sort, setSort] = useState<"recent" | "old">("recent");
  const [view, setView] = useState<"applications" | "users" | "staff" | "security">("users");
  const [uploadingDocument, setUploadingDocument] = useState(false);
  const [paymentStatusesMap, setPaymentStatusesMap] = useState<Record<string, AdminPaymentState>>({});
  const [paymentStatus, setPaymentStatus] = useState<AdminPaymentState>("pending");

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      return;
    }
    if (user.role === "staff") {
      router.replace("/staff");
      return;
    }
    if (user.role !== "admin") {
      router.replace("/dashboard");
      return;
    }
    Promise.all([getAdminApplications(), getAdminUsers()])
      .then(([applicationsResponse, usersResponse]) => {
        const nextApps = applicationsResponse.data.applications.map((app) => ({
          ...app,
          serviceSlug: app.serviceSlug ?? app.service,
        }));
        setApps(nextApps);
        setPaymentStatusesMap(
          Object.fromEntries(
            usersResponse.data.users.map((entry) => [entry.id, entry.paymentStatus ?? "pending"]),
          ) as Record<string, AdminPaymentState>,
        );
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Unable to load applications."))
      .finally(() => setLoading(false));
  }, [authLoading, router, user]);

  const services = useMemo(() => [...new Set(apps.map((app) => app.serviceSlug))].sort(), [apps]);
  const countries = useMemo(
    () => [...new Set(apps.map(countryOf))].filter((x) => x !== "—").sort(),
    [apps],
  );
  const filtered = useMemo(
    () =>
      apps
        .filter(
          (app) =>
            (statusFilter === "all" || app.status === statusFilter) &&
            (serviceFilter === "all" || app.serviceSlug === serviceFilter) &&
            (countryFilter === "all" || countryOf(app) === countryFilter),
        )
        .sort((a, b) =>
          sort === "recent"
            ? +new Date(b.createdAt) - +new Date(a.createdAt)
            : +new Date(a.createdAt) - +new Date(b.createdAt),
        ),
    [apps, statusFilter, serviceFilter, countryFilter, sort],
  );

  if (authLoading)
    return (
      <main className="fm-page flex min-h-screen items-center justify-center px-fm-6">
        <p className="fm-label">Loading admin panel...</p>
      </main>
    );

  if (!user) return <AdminLogin />;

  if (user.role === "staff")
    return (
      <main className="fm-page flex min-h-screen items-center justify-center px-fm-6">
        <p className="fm-label">Opening staff portal...</p>
      </main>
    );

  if (user.role !== "admin")
    return (
      <main className="fm-page flex min-h-screen items-center justify-center px-fm-6">
        <p className="fm-label">Redirecting to your dashboard...</p>
      </main>
    );

  const navigationItems: Array<{
    key: typeof view;
    label: string;
    Icon: typeof FileText;
  }> = [
    { key: "users", label: "Users", Icon: Users },
    { key: "staff", label: "Staff", Icon: UserPlus },
    { key: "security", label: "Security", Icon: KeyRound },
  ];
  const activeView = view;

  async function openApplication(id: string) {
    setDetailLoading(true);
    setError("");
    try {
      const detail = (await getAdminApplication(id)).data;
      const roleDocuments = buildRoleDocumentGroups(detail.application).flatMap((group) => group.documents);
      const allDocuments = [...detail.signedDocuments, ...roleDocuments] as ApplicationDocument[];
      const mergedDocuments = Array.from(
        allDocuments.reduce((documents, document) => {
          const key = document.path ?? document.id ?? document.documentName ?? document.name ?? `document-${documents.size}`;
          documents.set(key, { ...(documents.get(key) ?? {}), ...document });
          return documents;
        }, new Map<string, ApplicationDocument>()).values(),
      );
      const selectedCustomerId = detail.customer?.id ?? "";
      setSelected({ ...detail, signedDocuments: mergedDocuments });
      setPaymentStatus(selectedCustomerId ? paymentStatusesMap[selectedCustomerId] ?? "pending" : "pending");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load application.");
    } finally {
      setDetailLoading(false);
    }
  }

  async function changeStatus(status: (typeof adminStatuses)[number]) {
    if (!selected) return;
    try {
      const response = await updateAdminApplicationStatus(
        selected.application.id,
        status,
        selected.application.updatedAt,
      );
      setSelected({ ...selected, application: response.data.application });
      setApps((current) =>
        current.map((app) =>
          app.id === selected.application.id ? { ...app, ...response.data.application } : app,
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update application.");
    }
  }

  async function changePaymentStatus(status: AdminPaymentState) {
    if (!selected?.customer) return;
    try {
      await updateAdminPaymentStatus(selected.customer.id, status);
      setPaymentStatusesMap((current) => ({
        ...current,
        [selected.customer!.id]: status,
      }));
      setPaymentStatus(status);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update payment status.");
    }
  }

  async function handleLogout() {
    await logout();
    router.replace("/admin");
  }

  async function uploadDocument(file: File | undefined) {
    if (!selected || !file) return;
    setUploadingDocument(true);
    setError("");
    try {
      await uploadAdminDocument(selected.application.id, file);
      const response = await getAdminApplication(selected.application.id);
      const roleDocuments = buildRoleDocumentGroups(response.data.application).flatMap((group) => group.documents);
      const mergedDocuments = Array.from(
        [...response.data.signedDocuments, ...roleDocuments].reduce((documents, document) => {
          const key = document.path ?? document.id ?? document.documentName ?? document.name ?? `document-${documents.size}`;
          documents.set(key, { ...(documents.get(key) ?? {}), ...document });
          return documents;
        }, new Map<string, ApplicationDocument>()).values(),
      );
      setSelected({
        ...response.data,
        signedDocuments: mergedDocuments,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to upload document.");
    } finally {
      setUploadingDocument(false);
    }
  }

  async function removeDocument(document: AdminApplicationDetail["signedDocuments"][number]) {
    if (!selected) return;

    const documentIdentifier = document.id ?? document.path ?? document.name ?? document.documentName;
    const displayName = document.documentName ?? document.name ?? document.path?.split("/").pop() ?? "this document";

    if (!documentIdentifier) {
      setError("This document cannot be removed because it has no identifier.");
      return;
    }

    const confirmed = await confirmToast({
      title: `Remove "${displayName}"?`,
      description: "This document will be deleted from the application.",
      confirmText: "Remove document",
      cancelText: "Keep it",
      variant: "danger",
    });
    if (!confirmed) return;

    try {
      await deleteAdminDocument(selected.application.id, documentIdentifier);

      const filteredSignedDocuments = selected.signedDocuments.filter((item) => {
        if (document.id && item.id && document.id === item.id) return false;
        if (document.path && item.path && document.path === item.path) return false;
        if (document.name && item.name && document.name === item.name) return false;
        if (document.documentName && item.documentName && document.documentName === item.documentName) return false;
        return true;
      });

      setSelected({
        ...selected,
        application: {
          ...selected.application,
          documents: (selected.application.documents ?? {}) as Record<string, unknown>,
        },
        signedDocuments: filteredSignedDocuments,
      });

      showToast({
        title: "Document removed",
        description: `${displayName} was removed from the application.`,
        variant: "success",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to remove document.");
    }
  }

  return (
    <div className="h-screen overflow-hidden bg-[var(--fm-graphite)] text-[var(--fm-text-primary)]">
      {mobileOpen && (
        <button
          aria-label="Close navigation"
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-40 bg-black/70 md:hidden"
        />
      )}
      <aside
        className={[
          `fixed inset-y-0 left-0 z-50 flex flex-col border-r border-[var(--fm-border)] bg-[var(--fm-graphite-deep)] transition-all duration-300`,
          sidebarOpen ? "w-[252px]" : "w-0 md:w-[72px]",
          mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
        ].join(" ")}
      >
        <div className="relative flex h-[69px] shrink-0 items-center border-b border-[var(--fm-border)] px-4">
          <div className="flex items-center gap-2">
            <span
              className={`text-[28px] font-semibold tracking-[-1.7px] ${!sidebarOpen ? "md:opacity-0" : ""}`}
            >
              audvertax
            </span>
            <span className="rounded-full bg-[var(--fm-lime-soft)] px-2 py-0.5 font-mono text-[9px] font-semibold text-[var(--fm-lime)]">
              {user.role === "admin" ? "Admin" : "Employee"}
            </span>
          </div>
          <button onClick={() => setMobileOpen(false)} className="ml-auto md:hidden">
            <X size={19} />
          </button>
          <button
            onClick={() => setSidebarOpen((v) => !v)}
            className="absolute -right-3 top-[42px] hidden h-6 w-6 items-center justify-center rounded-full border border-[var(--fm-border)] bg-[var(--fm-surface)] md:flex"
          >
            <ChevronLeft size={14} className={!sidebarOpen ? "rotate-180" : ""} />
          </button>
        </div>
        <nav className="flex-1 px-2.5 pt-3">
          {navigationItems.map(({ key, label, Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setView(key as typeof view)}
              className={`mb-1 flex h-[42px] w-full items-center gap-3 rounded-[var(--fm-radius-md)] px-4 text-left text-sm font-medium ${activeView === key ? "bg-fm-lime text-fm-graphite-deep" : "text-fm-text-secondary hover:bg-fm-surface"}`}
            >
              <Icon size={20} /> <span className={!sidebarOpen ? "md:hidden" : ""}>{label}</span>
            </button>
          ))}
        </nav>
        <div
          className={`border-t border-[var(--fm-border)] p-3 ${!sidebarOpen ? "md:opacity-0" : ""}`}
        >
          <button
            type="button"
            onClick={() => void handleLogout()}
            className="flex w-full items-center gap-3 rounded-[var(--fm-radius-md)] border border-fm-danger/30 bg-fm-danger/5 px-3 py-2.5 text-left text-sm font-semibold text-fm-danger transition-colors hover:bg-fm-danger/10"
          >
            <LogOut size={18} />
            <span className={!sidebarOpen ? "md:hidden" : ""}>Logout</span>
          </button>
        </div>
      </aside>

      <div
        className={`h-full min-h-0 transition-[margin] duration-300 ${sidebarOpen ? "md:ml-[252px]" : "md:ml-[72px]"}`}
      >
        <button
          onClick={() => setMobileOpen(true)}
          className="fixed left-4 top-4 z-30 flex h-10 w-10 items-center justify-center rounded-full border border-[var(--fm-border)] bg-[var(--fm-surface)] shadow-lg md:hidden"
          aria-label="Open navigation"
        >
          <Menu size={19} />
        </button>
        <main className="h-full min-h-0 overflow-hidden px-fm-4 py-fm-4 md:px-fm-6 md:py-fm-5">
          <div className="mx-auto flex h-full min-h-0 max-w-[1600px] flex-col">
            {error && (
              <div className="mb-5 rounded-fm-lg border border-fm-danger/30 bg-fm-danger/5 p-fm-4 text-sm text-fm-danger">
                {error}
              </div>
            )}
            {activeView !== "applications" && (
              <div className="min-h-0 flex-1 overflow-y-auto">
                {activeView === "users" && <AdminUsersView />}
                {activeView === "staff" && <StaffManagementView />}
                {activeView === "security" && <AdminSecurityView />}
              </div>
            )}
            {activeView === "applications" && (
              <div className="flex min-h-0 flex-1 flex-col">
            <section className="mb-4 grid shrink-0 gap-2 rounded-fm-xl border border-fm-border-soft bg-fm-surface/80 p-3 shadow-[0_8px_30px_rgba(0,0,0,0.12)] backdrop-blur md:grid-cols-4">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="h-10 min-w-0 rounded-fm-md border border-fm-border-soft bg-fm-graphite-deep px-3 text-sm outline-none transition-[border-color,box-shadow,background-color] duration-200 hover:border-fm-border focus:border-fm-lime focus:bg-fm-surface-raised focus:ring-2 focus:ring-fm-lime/10"
              >
                <option value="all">All statuses</option>
                {adminStatuses.map((s) => (
                  <option key={s} value={s}>
                    {displayStatus(s)}
                  </option>
                ))}
              </select>
              <select
                value={serviceFilter}
                onChange={(e) => setServiceFilter(e.target.value)}
                className="h-10 min-w-0 rounded-fm-md border border-fm-border-soft bg-fm-graphite-deep px-3 text-sm outline-none transition-[border-color,box-shadow,background-color] duration-200 hover:border-fm-border focus:border-fm-lime focus:bg-fm-surface-raised focus:ring-2 focus:ring-fm-lime/10"
              >
                <option value="all">All services</option>
                {services.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <select
                value={countryFilter}
                onChange={(e) => setCountryFilter(e.target.value)}
                className="h-10 min-w-0 rounded-fm-md border border-fm-border-soft bg-fm-graphite-deep px-3 text-sm outline-none transition-[border-color,box-shadow,background-color] duration-200 hover:border-fm-border focus:border-fm-lime focus:bg-fm-surface-raised focus:ring-2 focus:ring-fm-lime/10"
              >
                <option value="all">All countries / jurisdictions</option>
                {countries.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as "recent" | "old")}
                className="h-10 min-w-0 rounded-fm-md border border-fm-border-soft bg-fm-graphite-deep px-3 text-sm outline-none transition-[border-color,box-shadow,background-color] duration-200 hover:border-fm-border focus:border-fm-lime focus:bg-fm-surface-raised focus:ring-2 focus:ring-fm-lime/10"
              >
                <option value="recent">Recent first</option>
                <option value="old">Oldest first</option>
              </select>
            </section>
            <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(360px,420px)]">
              <section className="flex min-h-0 flex-col overflow-hidden rounded-fm-xl border border-fm-border-soft bg-fm-surface shadow-[0_12px_40px_rgba(0,0,0,0.12)]">
                {loading ? (
                  <div className="p-10 text-center">Loading applications...</div>
                ) : !filtered.length ? (
                  <div className="p-10 text-center text-sm text-fm-text-secondary">
                    No applications match these filters.
                  </div>
                ) : (
                  <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2 md:p-3">
                    {filtered.map((app) => (
                      <button
                        key={app.id}
                        onClick={() => openApplication(app.id)}
                        className={`block w-full min-w-0 rounded-fm-lg border p-4 text-left transition-[border-color,background-color,box-shadow,transform] duration-200 ${
                          selected?.application.id === app.id
                            ? "border-fm-lime bg-fm-lime/10 shadow-[0_8px_24px_rgba(0,0,0,0.16)]"
                            : "border-fm-border-soft bg-fm-graphite-deep/50 hover:-translate-y-px hover:border-fm-border hover:bg-fm-surface-raised"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className="font-mono text-[10px] text-fm-text-tertiary">{app.id}</p>
                            <h3 className="mt-1 break-words font-semibold">{app.serviceSlug}</h3>
                            <p className="mt-1 text-sm text-fm-text-secondary">
                              {app.customer
                                ? `${app.customer.firstName} ${app.customer.lastName} · ${app.customer.email}`
                                : "Unknown customer"}
                            </p>
                          </div>
                          <span
                            className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase ${
                              selected?.application.id === app.id
                                ? "border-fm-lime bg-fm-lime text-fm-graphite-deep"
                                : "border-fm-border bg-fm-surface"
                            }`}
                          >
                            {displayStatus(app.status)}
                          </span>
                        </div>
                        <p className="mt-3 text-xs text-fm-text-tertiary">
                          {countryOf(app)} · {formatDate(app.createdAt)}
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              </section>
              <section className="flex min-h-0 flex-col overflow-hidden rounded-fm-xl border border-fm-border-soft bg-fm-surface shadow-[0_12px_40px_rgba(0,0,0,0.12)]">
                {detailLoading ? (
                  <div className="p-8 text-center">Loading application...</div>
                ) : !selected ? (
                  <div className="p-8 text-center text-sm text-fm-text-secondary">
                    Select an application to inspect all answers, documents and billing.
                  </div>
                ) : (
                  <div className="min-h-0 flex-1 overflow-y-auto p-5 md:p-6">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-mono text-[10px] text-fm-text-tertiary">
                          {selected.application.id}
                        </p>
                        <h2 className="mt-1 text-xl font-semibold">
                          {selected.application.serviceSlug}
                        </h2>
                        <p className="mt-1 text-sm text-fm-text-secondary">
                          {selected.customer
                            ? `${selected.customer.firstName} ${selected.customer.lastName} · ${selected.customer.email}`
                            : "Unknown customer"}
                        </p>
                      </div>
                      <button onClick={() => setSelected(null)} aria-label="Close details">
                        <X size={18} />
                      </button>
                    </div>
                    <div className="mt-6 space-y-5">
                      <div className="grid gap-3 sm:grid-cols-3">
                        <div>
                          <p className="fm-label">Payment status</p>
                          <select
                            value={paymentStatus}
                            onChange={(e) => void changePaymentStatus(e.target.value as AdminPaymentState)}
                            className="mt-2 h-10 w-full rounded-fm-md border border-fm-border bg-fm-graphite-deep px-3 text-sm"
                          >
                            {paymentStatuses.map((s) => (
                              <option key={s} value={s}>
                                {displayStatus(s)}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <p className="fm-label">Application status</p>
                          <select
                            value={selected.application.status ?? "submitted"}
                            onChange={(e) => void changeStatus(e.target.value as (typeof adminStatuses)[number])}
                            className="mt-2 h-10 w-full rounded-fm-md border border-fm-border bg-fm-graphite-deep px-3 text-sm"
                          >
                            {adminStatuses.map((s) => (
                              <option key={s} value={s}>
                                {s === "cancelled" ? "Rejected" : displayStatus(s)}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="flex items-end">
                          <label className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-fm-md border border-dashed border-fm-border bg-fm-graphite-deep px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-fm-text-secondary hover:border-fm-lime hover:text-fm-lime">
                            <Upload size={14} />
                            {uploadingDocument ? "Uploading..." : "Upload document"}
                            <input
                              type="file"
                              accept=".pdf,.jpg,.jpeg,.png"
                              disabled={uploadingDocument}
                              onChange={(event) => {
                                void uploadDocument(event.target.files?.[0]);
                                event.currentTarget.value = "";
                              }}
                              className="sr-only"
                            />
                          </label>
                        </div>
                      </div>
                      <div>
                        <p className="fm-label">Submitted</p>
                        <p className="mt-1 text-sm">{formatDate(selected.application.createdAt)}</p>
                      </div>
                      {selected.billing && (
                        <div className="rounded-fm-lg border border-fm-border p-4">
                          <p className="fm-label">Billing</p>
                          <p className="mt-2 text-sm">
                            {selected.billing.currency} {selected.billing.total.toFixed(2)} ·{" "}
                            {selected.billing.status}
                          </p>
                        </div>
                      )}
                      <div>
                        <p className="fm-label">Application details</p>
                        <div className="mt-2 overflow-hidden rounded-fm-lg border border-fm-border">
                          {selected.application.serviceSlug === "usa-llc" && (
                            <div className="mb-4">
                              <MembersPanel members={selected.application.data.members} />
                            </div>
                          )}
                          <ReadableData
                            value={selected.application.data}
                            skipKeys={
                              selected.application.serviceSlug === "usa-llc" ? ["members"] : []
                            }
                          />
                        </div>
                      </div>
                      <div>
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <p className="fm-label">Documents</p>
                        </div>

                        <div className="space-y-3">
                          {(() => {
                            const roleGroups = buildRoleDocumentGroups(selected.application);
                            const grouped = roleGroups.map((group) => ({
                              ...group,
                              documents: [
                                ...group.documents,
                                ...selected.signedDocuments.filter((document) => {
                                  const category = (document.category ?? document.uploadedByRole ?? "customer").toLowerCase();
                                  return category === group.key || category === group.title.toLowerCase().replace(" documents", "");
                                }),
                              ].filter((document, index, list) => {
                                const key = document.path ?? document.id ?? document.documentName ?? document.name ?? `${index}`;
                                return list.findIndex((entry) => (entry.path ?? entry.id ?? entry.documentName ?? entry.name ?? `${index}`) === key) === index;
                              }),
                            }));

                            const flattened = grouped.flatMap((group) => group.documents);
                            const fallbackDocuments = selected.signedDocuments.filter(
                              (document) => !flattened.some((entry) => {
                                const left = document.path ?? document.id ?? document.documentName ?? document.name ?? "";
                                const right = entry.path ?? entry.id ?? entry.documentName ?? entry.name ?? "";
                                return left && right && left === right;
                              }),
                            );

                            if (!roleGroups.length && !fallbackDocuments.length) {
                              return <p className="text-sm text-fm-text-secondary">No uploaded documents.</p>;
                            }

                            return [
                              ...grouped.filter((group) => group.documents.length),
                              ...(fallbackDocuments.length ? [{ key: "uploaded", title: "Uploaded documents", documents: fallbackDocuments }] : []),
                            ].map((group) => (
                              <DocumentCard
                                key={group.key}
                                title={group.title}
                                documents={group.documents}
                                applicationId={selected.application.id}
                                onRemoveDocument={removeDocument}
                              />
                            ));
                          })()}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </section>
            </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
