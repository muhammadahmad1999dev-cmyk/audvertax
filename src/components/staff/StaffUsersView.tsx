"use client";

import { useEffect, useState } from "react";
import { Download, Loader2, Upload, Users } from "lucide-react";
import {
  deleteStaffDocument,
  getStaffDocumentDownloadUrl,
  getStaffApplication,
  getStaffApplications,
  getStaffUsers,
  updateStaffApplicationStatus,
  uploadStaffDocument,
  type AdminApplicationDetail,
  type AdminApplicationRecord,
  type AdminUserRecord,
  type ApplicationDocument,
} from "@/lib/api";
import { confirmToast, showToast } from "@/lib/toast";

function formatDate(value?: string) {
  return value
    ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(value))
    : "Never";
}

function formatBytes(value?: number) {
  if (typeof value !== "number") return "Unknown size";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function FullName({ user }: { user: { firstName: string; lastName: string } }) {
  return <span>{`${user.firstName} ${user.lastName}`.trim() || "Unnamed user"}</span>;
}

function readableKey(key: string) {
  return key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function ApplicationData({ value }: { value: unknown }) {
  if (Array.isArray(value)) {
    return (
      <div className="space-y-2">
        {value.map((item, index) => (
          <div key={index} className="rounded-fm-sm border border-fm-border-soft p-2">
            <ApplicationData value={item} />
          </div>
        ))}
      </div>
    );
  }

  if (value && typeof value === "object") {
    return (
      <div className="divide-y divide-fm-border-soft rounded-fm-md border border-fm-border-soft">
        {Object.entries(value as Record<string, unknown>).map(([key, item]) => (
          <div key={key} className="grid gap-1 p-3 sm:grid-cols-[180px_1fr] sm:gap-4">
            <p className="text-xs font-semibold text-fm-text-secondary">{readableKey(key)}</p>
            <div className="min-w-0 break-words text-sm text-fm-text-primary">
              {item && typeof item === "object" ? <ApplicationData value={item} /> : String(item ?? "-")}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return <span>{String(value ?? "-")}</span>;
}

function Panel({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="rounded-fm-xl border border-fm-border-soft bg-fm-surface p-5 shadow-[0_12px_40px_rgba(0,0,0,0.12)] md:p-6">
      <div className="mb-5">
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="mt-1 text-sm text-fm-text-secondary">{description}</p>
      </div>
      {children}
    </section>
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
  const isFileLike = typeof item.path === "string" && (typeof item.id === "string" || typeof item.documentId === "string" || typeof item.name === "string" || typeof item.type === "string");

  if (isFileLike) {
    return [{
      id: typeof item.id === "string" ? item.id : undefined,
      documentId: typeof item.documentId === "string" ? item.documentId : undefined,
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

function isStaffDocument(document: ApplicationDocument) {
  const role = (document.uploadedByRole ?? document.role ?? document.category ?? "").toLowerCase();
  return role === "staff";
}

function matchesDocument(target: ApplicationDocument, candidate: unknown) {
  if (!candidate || typeof candidate !== "object") return false;

  const document = candidate as Record<string, unknown>;
  const targetPath = typeof target.path === "string" ? target.path : "";
  const targetId = typeof target.id === "string" ? target.id : "";
  const targetName = typeof target.name === "string" ? target.name : typeof target.documentName === "string" ? target.documentName : "";

  const candidatePath = typeof document.path === "string" ? document.path : "";
  const candidateId = typeof document.id === "string" ? document.id : "";
  const candidateName = typeof document.name === "string" ? document.name : typeof document.documentName === "string" ? document.documentName : "";

  return Boolean(
    (targetPath && candidatePath && targetPath === candidatePath)
      || (targetId && candidateId && targetId === candidateId)
      || (targetName && candidateName && targetName === candidateName),
  );
}

function removeDocumentFromTree(value: unknown, target: ApplicationDocument): unknown {
  if (Array.isArray(value)) {
    return value
      .map((item) => removeDocumentFromTree(item, target))
      .filter((item) => !(item && typeof item === "object" && matchesDocument(target, item)));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const record = value as Record<string, unknown>;
  const nextRecord: Record<string, unknown> = {};

  Object.entries(record).forEach(([key, item]) => {
    const nextValue = removeDocumentFromTree(item, target);
    if (nextValue !== undefined && !(item && typeof item === "object" && matchesDocument(target, item))) {
      nextRecord[key] = nextValue;
    }
  });

  return nextRecord;
}

function DocumentCard({ title, documents, applicationId, deletingDocumentId, onRemoveDocument }: { title: string; documents: ApplicationDocument[]; applicationId: string; deletingDocumentId?: string | null; onRemoveDocument?: (applicationId: string, document: ApplicationDocument) => void }) {
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
            const hideRemove = !isStaffDocument(document) || !onRemoveDocument;

            return (
              <div key={`${document.path ?? document.url ?? "document"}-${index}`} className="flex items-center justify-between gap-2 rounded-fm-lg border border-fm-border-soft bg-fm-surface-raised px-3 py-2.5 transition hover:border-fm-lime hover:bg-fm-surface">
                <a
                  href={getStaffDocumentDownloadUrl(applicationId, document.id ?? document.path ?? document.name ?? document.documentName ?? "")}
                  download={document.name ?? document.documentName ?? true}
                  target="_blank"
                  rel="noreferrer"
                  className="flex min-w-0 flex-1 items-center justify-between gap-3 text-sm text-fm-text-primary"
                >
                  <span className="min-w-0 flex-1 break-all text-[13px] leading-snug font-medium">{name}</span>
                  <Download size={16} className="shrink-0 text-fm-text-secondary" />
                </a>

                {!hideRemove && (
                  <button
                    type="button"
                    disabled={deletingDocumentId === (document.id ?? document.documentId)}
                    onClick={() => { void onRemoveDocument?.(applicationId, document); }}
                    className="shrink-0 rounded-fm-md border border-fm-danger/30 bg-fm-danger/5 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-fm-danger transition hover:bg-fm-danger/10"
                  >
                    {deletingDocumentId === (document.id ?? document.documentId) ? "Removing..." : "Remove"}
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

export function StaffUsersView() {
  const [users, setUsers] = useState<AdminUserRecord[]>([]);
  const [staffApplications, setStaffApplications] = useState<AdminApplicationRecord[]>([]);
  const [selectedUser, setSelectedUser] = useState<AdminUserRecord | null>(null);
  const [applications, setApplications] = useState<AdminApplicationDetail[]>([]);
  const [loadingApplications, setLoadingApplications] = useState(false);
  const [expandedApplicationId, setExpandedApplicationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState<string | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null);
  const [deletingDocumentId, setDeletingDocumentId] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([getStaffUsers(), getStaffApplications()])
      .then(([userResponse, applicationResponse]) => {
        setUsers(userResponse.data.users);
        setStaffApplications(applicationResponse.data.applications);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Unable to load paid customers."))
      .finally(() => setLoading(false));
  }, []);

  async function uploadDocument(applicationId: string, file: File | undefined) {
    if (!file) return;
    setUploading(applicationId);
    setError("");
    try {
      await uploadStaffDocument(applicationId, file);
      const response = await getStaffApplication(applicationId);
      const detail = response.data as AdminApplicationDetail;
      const roleDocuments = buildRoleDocumentGroups(detail.application).flatMap((group) => group.documents);
      const mergedDocuments = Array.from(
        [...detail.signedDocuments, ...roleDocuments].reduce((documents, document) => {
          const key = document.path ?? document.id ?? document.documentName ?? document.name ?? `document-${documents.size}`;
          documents.set(key, { ...(documents.get(key) ?? {}), ...document });
          return documents;
        }, new Map<string, ApplicationDocument>()).values(),
      );
      setApplications((current) => current.map((item) => item.application.id === applicationId
        ? { ...item, application: detail.application, signedDocuments: mergedDocuments }
        : item));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to upload document.");
    } finally {
      setUploading(null);
    }
  }

  async function selectUser(user: AdminUserRecord) {
    setSelectedUser(user);
    setApplications([]);
    setExpandedApplicationId(null);
    setLoadingApplications(true);
    setError("");
    try {
      const applicationIds = staffApplications.filter((application) => application?.customer?.id === user.id).map((application) => application.id);
      const details = await Promise.all((applicationIds.length ? applicationIds : user.applicationIds ?? []).map((applicationId) => getStaffApplication(applicationId)));
      setApplications(details.map((response) => {
        const detail = response.data as AdminApplicationDetail;
        const roleDocuments = buildRoleDocumentGroups(detail.application).flatMap((group) => group.documents);
        const allDocuments = [...detail.signedDocuments, ...roleDocuments] as ApplicationDocument[];
        const mergedDocuments = Array.from(allDocuments.reduce((documents, document) => {
          const key = document.path ?? document.id ?? document.documentName ?? document.name ?? `document-${documents.size}`;
          documents.set(key, { ...(documents.get(key) ?? {}), ...document });
          return documents;
        }, new Map<string, ApplicationDocument>()).values());
        return { ...detail, signedDocuments: mergedDocuments };
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load application details.");
    } finally {
      setLoadingApplications(false);
    }
  }

  async function changeStatus(application: AdminApplicationDetail["application"], status: "processing" | "completed" | "cancelled") {
    setUpdatingStatus(application.id);
    setError("");
    try {
      const response = await updateStaffApplicationStatus(application.id, status, application.updatedAt);
      setApplications((current) => current.map((item) => item.application.id === application.id ? { ...item, application: { ...item.application, ...response.data.application } } : item));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update application status.");
    } finally {
      setUpdatingStatus(null);
    }
  }

  async function removeStaffDocument(applicationId: string, document: ApplicationDocument) {
    const documentIdentifier = document.id ?? document.documentId;
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

    setDeletingDocumentId(documentIdentifier);
    setError("");

    try {
      const response = await deleteStaffDocument(applicationId, documentIdentifier);
      const returnedDocuments = buildRoleDocumentGroups({
        ...response.data.application,
        documents: response.data.documents,
      }).flatMap((group) => group.documents);

      setApplications((current) => current.map((item) => {
        if (item.application.id !== applicationId) return item;

        return {
          ...item,
          application: response.data.application,
          signedDocuments: returnedDocuments,
        };
      }));

      showToast({
        title: "Document removed",
        description: `${displayName} was removed from the application.`,
        variant: "success",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to remove staff document.");
    } finally {
      setDeletingDocumentId(null);
    }
  }

  return (
    <Panel title="Paid customers" description="You can view paid customers and upload their application documents.">
      {error && <p className="mb-4 text-sm text-fm-danger">{error}</p>}
      {loading ? <p className="py-8 text-sm text-fm-text-secondary">Loading paid customers...</p> : !users.length ? <p className="py-8 text-sm text-fm-text-secondary">No paid customers yet.</p> : selectedUser ? (
        <div>
          <button type="button" onClick={() => setSelectedUser(null)} className="mb-4 text-sm font-semibold text-fm-text-secondary hover:text-fm-text-primary">← Back to paid customers</button>
          <div className="mb-5"><p className="text-lg font-semibold"><FullName user={selectedUser} /></p><p className="text-sm text-fm-text-secondary">{selectedUser.email}</p></div>
          {loadingApplications ? <p className="py-8 text-sm text-fm-text-secondary">Loading applications...</p> : !applications.length ? <p className="py-8 text-sm text-fm-text-secondary">No application details returned.</p> : <div className="space-y-3">
            {applications.map(({ application, signedDocuments }) => (
              <div key={application.id} className="rounded-fm-xl border border-fm-border-soft bg-fm-surface p-3 shadow-[0_12px_30px_rgba(17,24,39,0.05)] md:p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <button type="button" onClick={() => setExpandedApplicationId((current) => current === application.id ? null : application.id)} className="min-w-0 flex-1 text-left">
                    <p className="text-sm font-semibold text-fm-text-primary">{application.serviceSlug ?? application.service}</p>
                    <p className="mt-1 text-xs text-fm-text-secondary">Submitted {formatDate(application.createdAt)} · {application.status ?? "Submitted"}</p>
                  </button>
                  <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
                    <select value={application.status ?? "processing"} disabled={updatingStatus === application.id} onChange={(event) => void changeStatus(application, event.target.value as "processing" | "completed" | "cancelled")} className="h-9 w-full rounded-fm-md border border-fm-border bg-fm-surface px-2 text-xs font-medium capitalize outline-none focus:border-fm-lime disabled:opacity-60 sm:w-auto">{(["processing", "completed", "cancelled"] as const).map((status) => <option key={status} value={status}>{status}</option>)}</select>
                    <label className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-fm-md border border-dashed border-fm-border px-3 py-2 text-xs font-semibold text-fm-text-secondary hover:border-fm-lime hover:text-fm-lime sm:w-auto">{uploading === application.id && <Loader2 size={14} className="animate-spin" />}{uploading === application.id ? "Uploading..." : "Upload document"}<input type="file" accept=".pdf,.jpg,.jpeg,.png" disabled={uploading === application.id} onChange={(event) => { void uploadDocument(application.id, event.target.files?.[0]); event.currentTarget.value = ""; }} className="sr-only" /></label>
                  </div>
                </div>
                {expandedApplicationId === application.id && <div className="mt-4 space-y-4 border-t border-fm-border-soft pt-4"><div><p className="fm-label mb-2">Application details</p><ApplicationData value={application.data} /></div><div><p className="fm-label mb-2">Documents</p><div className="grid gap-3 lg:grid-cols-2">{buildRoleDocumentGroups(application).map((group) => <DocumentCard key={group.key} title={group.title} documents={group.documents} applicationId={application.id} deletingDocumentId={deletingDocumentId} onRemoveDocument={removeStaffDocument} />)}</div></div></div>}
              </div>
            ))}
          </div>}
        </div>
      ) : <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{users.map((user) => <button key={user.id} type="button" onClick={() => void selectUser(user)} className="group flex w-full items-center justify-between gap-3 rounded-fm-xl border border-fm-border-soft bg-fm-surface p-3 text-left shadow-[0_10px_25px_rgba(15,23,42,0.04)] transition duration-150 hover:border-fm-lime hover:bg-fm-surface-raised sm:p-4"><span className="flex min-w-0 items-center gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-fm-lime/10 text-fm-lime"><Users size={18} /></span><span className="min-w-0"><span className="block truncate text-sm font-semibold text-fm-text-primary"><FullName user={user} /></span><span className="mt-1 block truncate text-xs text-fm-text-secondary">{user.email}</span></span></span><span className="shrink-0 rounded-full border border-fm-border-soft bg-fm-surface px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.08em] text-fm-text-secondary">{user.paidApplicationsCount}</span></button>)}</div>}
    </Panel>
  );
}
