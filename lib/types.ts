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

export type DayNotice = {
  date: string | null;
  text: string;
};

export type PlanDay = {
  date: string;
  /** "Donnerstag" */
  dayLabel: string | null;
  /** "Woche A" */
  weekLabel: string | null;
};

export type SubstitutionPayload = {
  success: boolean;
  stale: boolean;
  /** All days covered by the fetched pages, ascending. */
  days: PlanDay[];
  pageCount: number;
  fetchedPages: number;
  lastUpdated: string | null;
  lastSuccessfulUpdate: string | null;
  sourceUpdatedAt: string | null;
  classes: string[];
  entries: SubstitutionEntry[];
  notices: DayNotice[];
  warnings: string[];
  error: string | null;
};

export type PageMetadata = {
  pageNumber: number;
  /** "Seite x / y" — Untis numbers pages per day. */
  pageOfDay: number | null;
  pagesOfDay: number | null;
  /** Page the Untis monitor shows next (meta refresh); 1 after the last page. */
  nextPage: number | null;
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
