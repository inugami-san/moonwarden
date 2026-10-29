import { GAME_RELEASE_INFO } from "../../../server/game-version";

export const dynamic = "force-dynamic";

/** Public release metadata only: no environment variables, tokens, or room state. */
export function GET() {
  return Response.json(GAME_RELEASE_INFO, { headers: { "Cache-Control": "no-store" } });
}
