import { SubstitutionApp } from "@/components/SubstitutionApp";
import { getCachedSubstitutionData } from "@/lib/cache";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const initialData = await getCachedSubstitutionData();

  return <SubstitutionApp initialData={initialData} />;
}
