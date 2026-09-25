"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { getMyApplications, type ApplicationRecord } from "@/lib/api";

export const APPLICATION_STATUSES = {
  draft: "Draft",
  ready_for_payment: "Ready for payment",
  submitted: "Submitted",
  paid: "Paid",
  processing: "Processing",
  changes_requested: "Changes requested",
  completed: "Completed",
  cancelled: "Cancelled",
} as const;

export type ApplicationStatus = keyof typeof APPLICATION_STATUSES;

export type ApplicationMember = {
  id: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  role?: string;
};

export type ApplicationDocument = {
  id?: string;
  documentType?: string;
  status?: string;
  fileName?: string;
  documentId?: string;
  ownerId?: string;
  role?: string;
  category?: string;
  uploadedByRole?: string;
};

export type ApplicationState = {
  id: string;
  userId?: string;
  serviceSlug: string;
  status: ApplicationStatus;
  currentStep: number;
  packageSlug?: string;
  formationState?: string;
  variantSlug?: string;
  addOnSlugs: string[];
  answers: Record<string, unknown>;
  documents: ApplicationDocument[];
  members: ApplicationMember[];
  createdAt: string;
  updatedAt: string;
};

type ApplicationStateUpdate = Partial<ApplicationState> & {
  answers?: Record<string, unknown>;
};

type ApplicationStateContextValue = {
  application: ApplicationState | null;
  applications: ApplicationState[];
  hydrated: boolean;
  updateApplication: (updates: ApplicationStateUpdate) => Promise<void>;
  setApplicationStatus: (status: ApplicationStatus) => Promise<void>;
  refreshApplications: () => Promise<void>;
  refreshError: string;
};

const STORAGE_KEY = "audvertax.application";
const ACTIVE_ID_KEY = "audvertax.currentApplicationId";

const ApplicationStateContext = createContext<ApplicationStateContextValue | undefined>(undefined);

function readStoredApplications(): ApplicationState[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw) as ApplicationState[] | ApplicationState | null;
    if (Array.isArray(parsed)) return parsed;
    if (parsed && typeof parsed === "object") return [parsed];
  } catch {
    return [];
  }

  return [];
}

function writeStoredApplications(applications: ApplicationState[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(applications));
}

function documentRole(key: string) {
  const normalized = key.toLowerCase();
  if (normalized.includes("owner")) return "owner";
  if (normalized.includes("member")) return "member";
  if (normalized.includes("staff")) return "staff";
  if (normalized.includes("admin")) return "admin";
  if (normalized.includes("customer")) return "customer";
  return undefined;
}

function collectBackendDocuments(value: unknown, inheritedRole?: string): Record<string, unknown>[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => collectBackendDocuments(item, inheritedRole));
  }

  if (!value || typeof value !== "object") return [];

  const document = value as Record<string, unknown>;
  const isDocument = [
    document.id,
    document.documentId,
    document.fileName,
    document.documentName,
    document.name,
    document.path,
  ].some((field) => typeof field === "string" && field.length > 0);

  return isDocument
    ? [{ ...document, __role: inheritedRole }]
    : Object.entries(document).flatMap(([key, child]) =>
        collectBackendDocuments(child, documentRole(key) ?? inheritedRole),
      );
}

function normalizeBackendApplication(record: ApplicationRecord): ApplicationState {
  const data = record.data ?? {};
  const rawDocuments = record.documents;
  const rawMembers = data.members;

  const rawDocumentList = collectBackendDocuments(rawDocuments);

  const documents = rawDocumentList
    .map((document) => {
      const path = typeof document.path === "string" ? document.path : undefined;
      const fileName = typeof document.fileName === "string"
        ? document.fileName
        : typeof document.documentName === "string"
          ? document.documentName
          : typeof document.name === "string"
            ? document.name
            : path?.split("/").pop() ?? "Uploaded document";

      return {
        id: typeof document.id === "string" ? document.id : path ?? fileName,
        documentId: typeof document.documentId === "string" ? document.documentId : typeof document.id === "string" ? document.id : path,
        documentType: typeof document.documentType === "string" ? document.documentType : typeof document.type === "string" ? document.type : "Document",
        status: typeof document.status === "string" ? document.status : "uploaded",
        fileName,
        ownerId: typeof document.ownerId === "string" ? document.ownerId : undefined,
        role: typeof document.role === "string" ? document.role : typeof document.__role === "string" ? document.__role : undefined,
        category: typeof document.category === "string" ? document.category : undefined,
        uploadedByRole: typeof document.uploadedByRole === "string" ? document.uploadedByRole : undefined,
      } satisfies ApplicationDocument;
    });

  const members = Array.isArray(rawMembers) ? rawMembers : [];

  const status = record.status ?? "submitted";

  return {
    id: record.id,
    userId: record.user_id,
    serviceSlug: record.serviceSlug ?? record.service,
    status,
    currentStep:
      typeof data.currentStep === "number"
        ? data.currentStep
        : typeof data.current_step === "number"
          ? data.current_step
          : 0,
    packageSlug: typeof data.packageSlug === "string" ? data.packageSlug : undefined,
    formationState: typeof data.formationState === "string" ? data.formationState : undefined,
    variantSlug: typeof data.variantSlug === "string" ? data.variantSlug : undefined,
    addOnSlugs: Array.isArray(data.addOnSlugs)
      ? data.addOnSlugs.filter((value): value is string => typeof value === "string")
      : [],
    answers: data,
    documents,
    members,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export default function ApplicationStateProvider({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const [applications, setApplications] = useState<ApplicationState[]>([]);
  const [hydrateState, setHydrateState] = useState(false);
  const [currentApplicationId, setCurrentApplicationId] = useState<string | null>(null);
  const [refreshError, setRefreshError] = useState("");

  const refreshApplications = useCallback(async () => {
    if (loading || !user) {
      setHydrateState(true);
      setApplications(readStoredApplications().filter((item) => item.status === "draft"));
      setCurrentApplicationId(null);
      setRefreshError("");
      return;
    }

    const storedApplications = readStoredApplications();
    try {
      setRefreshError("");
      const response = await getMyApplications();
      const backendApplications = response.data.applications.map(normalizeBackendApplication);
      const localDrafts = storedApplications.filter((item) => item.status === "draft");
      setApplications([
        ...backendApplications,
        ...localDrafts.filter((draft) => !backendApplications.some((item) => item.id === draft.id)),
      ]);
      const activeId =
        typeof window === "undefined" ? null : window.sessionStorage.getItem(ACTIVE_ID_KEY);
      const availableIds = new Set([...backendApplications, ...localDrafts].map((item) => item.id));
      if (activeId && availableIds.has(activeId)) setCurrentApplicationId(activeId);
      else if (backendApplications[0]?.id) setCurrentApplicationId(backendApplications[0].id);
      else if (localDrafts[0]?.id) setCurrentApplicationId(localDrafts[0].id);
    } catch (error) {
      const isAuthError =
        error instanceof Error && (error.message.includes("not signed in") || error.message.includes("Unauthorized") || error.message.includes("unauthorized"));

      if (!isAuthError) {
        setRefreshError(error instanceof Error ? error.message : "Unable to refresh applications.");
      } else {
        setRefreshError("");
      }

      setApplications((current) =>
        current.length ? current : storedApplications.filter((item) => item.status === "draft"),
      );
      throw error;
    } finally {
      setHydrateState(true);
    }
  }, [loading, user]);

  useEffect(() => {
    if (loading) return;
    void refreshApplications().catch(() => undefined);
  }, [loading, refreshApplications]);

  useEffect(() => {
    if (loading || !user) return;
    const onFocus = () => void refreshApplications().catch(() => undefined);
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [loading, refreshApplications, user]);

  useEffect(() => {
    if (!hydrateState) return;
    writeStoredApplications(applications);

    const nextCurrentId = currentApplicationId ?? applications[0]?.id ?? null;
    if (nextCurrentId) {
      setCurrentApplicationId(nextCurrentId);
      if (typeof window !== "undefined")
        window.sessionStorage.setItem(ACTIVE_ID_KEY, nextCurrentId);
    } else if (typeof window !== "undefined") {
      window.sessionStorage.removeItem(ACTIVE_ID_KEY);
    }
  }, [applications, currentApplicationId, hydrateState]);

  const application = useMemo(() => {
    const activeId = currentApplicationId ?? applications[0]?.id ?? null;
    if (!activeId) return null;
    return applications.find((candidate) => candidate.id === activeId) ?? applications[0] ?? null;
  }, [applications, currentApplicationId]);

  const updateApplication = useCallback(
    async (updates: ApplicationStateUpdate) => {
      setApplications((current) => {
        const nextApplications = current.map((entry) => {
          if (entry.id !== (currentApplicationId ?? entry.id)) return entry;
          return {
            ...entry,
            ...updates,
            answers: {
              ...entry.answers,
              ...(updates.answers ?? {}),
            },
            updatedAt: new Date().toISOString(),
          };
        });

        if (!nextApplications.length) return current;
        return nextApplications;
      });
    },
    [currentApplicationId],
  );

  const setApplicationStatus = useCallback(
    async (status: ApplicationStatus) => {
      setApplications((current) =>
        current.map((entry) => {
          if (entry.id !== (currentApplicationId ?? entry.id)) return entry;
          return {
            ...entry,
            status,
            updatedAt: new Date().toISOString(),
          };
        }),
      );
    },
    [currentApplicationId],
  );

  const value = useMemo<ApplicationStateContextValue>(
    () => ({
      application,
      applications,
      hydrated: hydrateState,
      updateApplication,
      setApplicationStatus,
      refreshApplications,
      refreshError,
    }),
    [
      application,
      applications,
      hydrateState,
      updateApplication,
      setApplicationStatus,
      refreshApplications,
      refreshError,
    ],
  );

  return (
    <ApplicationStateContext.Provider value={value}>{children}</ApplicationStateContext.Provider>
  );
}

export function useApplicationState() {
  const context = useContext(ApplicationStateContext);

  if (!context) {
    throw new Error("useApplicationState must be used within an ApplicationStateProvider");
  }

  return context;
}
