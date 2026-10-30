import { notFound } from "next/navigation";
import { RootwakePreview } from "./preview";

/** Local art review, never a production switch for live Ordeals. */
export default function RootwakePreviewPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <RootwakePreview />;
}
