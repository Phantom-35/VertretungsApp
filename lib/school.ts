/** The school's public Untis pages: subst_001.htm, subst_002.htm, … */
export const SCHOOL_PLAN_BASE_URL = "https://monitor2020.meckenheim-kag.com/schueler/subst_";

/** The first page of the school's own plan, for looking it up by hand. */
export const SCHOOL_PLAN_URL = `${SCHOOL_PLAN_BASE_URL}001.htm`;

/**
 * The school's second copy of the same pages. Less reliable, so only a
 * stand-in: used when monitor2020 does not deliver its first page.
 */
export const SCHOOL_PLAN_FALLBACK_BASE_URL = "https://vertretung.meckenheim-kag.com/subst_";
