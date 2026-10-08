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

export default async function HomePage() {
  const initialData = await getInitialData();

  return <SubstitutionApp initialData={initialData} />;
}
