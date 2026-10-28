import { notFound } from "next/navigation";
import { ShrinePreview } from "./preview";

/** Local art review only; this is not a production gameplay route. */
export default function ShrinePreviewPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <ShrinePreview />;
}
