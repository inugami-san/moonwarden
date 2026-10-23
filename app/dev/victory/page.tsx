import { notFound } from "next/navigation";
import { VictoryPreview } from "./victory-preview";

/** Local art review only: production must never offer a fake match-result route. */
export default function VictoryPreviewPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <VictoryPreview />;
}
