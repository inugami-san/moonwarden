import { notFound } from "next/navigation";
import { CatPreview } from "./preview";

export default function CatsPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <CatPreview />;
}
