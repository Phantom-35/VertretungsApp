export type SubstitutionEntry = {
  id: string;
  className: string;
  lesson: string;
  type: string;
  substitute: string;
  teacher: string;
  room: string;
  subject: string;
  text: string;
  date: string;
  page: number;
};

export type SubstitutionPayload = {
  success: boolean;
  stale: boolean;
  date: string | null;
  dayLabel: string | null;
  weekLabel: string | null;
  pageCount: number;
  fetchedPages: number;
  lastUpdated: string | null;
  lastSuccessfulUpdate: string | null;
  sourceUpdatedAt: string | null;
  classes: string[];
  entries: SubstitutionEntry[];
  notices: string[];
  warnings: string[];
  error: string | null;
};

export type PageMetadata = {
  pageNumber: number;
  totalPages: number | null;
  date: string | null;
  dayLabel: string | null;
  weekLabel: string | null;
  sourceUpdatedAt: string | null;
  notices: string[];
};

export type ParsedPage = {
  meta: PageMetadata;
  entries: SubstitutionEntry[];
};

export type FetchedPage =
  | {
      kind: "ok";
      pageNumber: number;
      url: string;
      html: string;
    }
  | {
      kind: "missing";
      pageNumber: number;
      url: string;
      reason: string;
    }
  | {
      kind: "error";
      pageNumber: number;
      url: string;
      reason: string;
    };
