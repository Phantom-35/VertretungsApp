import { SubstitutionApp } from "@/components/SubstitutionApp";
import { getCachedSubstitutionData } from "@/lib/cache";

export const dynamic = "force-dynamic";

/**
 * Do not block the first paint on a slow school server: if the data is not
 * ready quickly, the client loads it itself (and joins the running request).
 */
const INITIAL_DATA_TIMEOUT_MS = 2_500;

async function getInitialData() {
  const timeout = new Promise<null>((resolve) =>
    setTimeout(() => resolve(null), INITIAL_DATA_TIMEOUT_MS),
  );
  const data = await Promise.race([getCachedSubstitutionData(), timeout]);
  return data?.success ? data : null;
}

/** `?day=2026-10-09`, e.g. from a notification. */
function parseDay(value: string | string[] | undefined) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const [initialData, { day }] = await Promise.all([getInitialData(), searchParams]);

  return <SubstitutionApp initialData={initialData} initialDay={parseDay(day)} />;
}
