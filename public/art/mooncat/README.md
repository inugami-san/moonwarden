# Moon-cat painted walk atlas v2

Generated 2026-10-27 with the built-in image-generation tool, using the user's
moon-cat character reference sheet. This is reference-derived AI artwork, not
a claim of an exact hand-painted reproduction. The original alpha PNG is kept
unchanged as `mooncat-walk-v2.png`; the game performs extraction/recoloring at
runtime. No external asset URL or API key is needed to play.

Columns: NORTH, NE, EAST, SE, SOUTH, SW, WEST, NW. Four walk-phase rows.
IMPORTANT: row gutters are not mathematically uniform. `atlasRows` finds alpha
gutters; do not slice this sheet using `image.height / 4`. Alpha and all poses
are validated by `tests/mooncat-sprites.test.mjs`.

`app/mooncat-sprites.ts` caches bounded color/expression variants, uses fixed
per-pose planted-paw baselines and torso registration, and maps them into the
existing 112-unit portrait frame. All poses share a scale; tail/toe motion does
not reposition the entire cat. Walk timing follows distance traveled rather
than lingering gaze motion.
`drawMooncat` is shared by the arena and portraits, with a vector loading/error
fallback. All five eye options remain supported; the default keeps painted eyes.
Reduced-motion gameplay supplies zero stride so the walk sheet stays at frame 0.
Review at `/dev/cats` locally. No deployment is part of this art request.

### Smooth walking follow-up

Default gameplay now rigs the painted paws from the contact pose rather than
swapping the four independently painted full-body frames. `cat-walk-rig.ts`
segments visible paws once per direction and supplies continuous swing/stance
transforms. The body and face remain stable. Hip joints are feathered; fading
composites the full character once. The original frames are still used for the
short home greeting and the review page's A/B comparison. No PNG was altered.

## Final generation prompt (built-in tool, transparent background enabled)

Use case: stylized-concept. Production game character sprite atlas, based very closely on the attached moon-cat reference (reference only, not a document to reproduce). Replicate the reference character and illustrated rendering as closely as possible: compact rounded kitten on FOUR short organic paws, large round head, soft cheeks, small triangular ears, tiny nose (NO snout), large luminous golden amber eyes, deep indigo/violet fur with rich smooth painterly volume and fine star speckles, beautiful thick upright curled tail, pale blue forehead crescent, blue-violet flowing fabric scarf with crescent medallion, cyan runic cuff. Do NOT simplify to flat vector, stiff cylinders, or geometric shapes. Fine clean dark-violet contours, hand-painted highlights and shadows exactly like reference. Actual transparent background, no beige, no floor, no drop shadows, no particle trails, no text or labels. Layout REQUIRED: exactly 8 columns by 4 rows, 32 isolated full-body cats total, equal evenly spaced rectangular cells in a wide 2:1 image. Every cell same character scale, centered with ample transparent margins and aligned feet at same baseline. Columns left to right: NORTH(back), NORTHEAST(back three-quarter facing upper right), EAST(profile facing right), SOUTHEAST(front three-quarter facing lower right), SOUTH(front facing viewer), SOUTHWEST(front three-quarter facing lower left), WEST(profile facing left), NORTHWEST(back three-quarter facing upper left). Each row is a different WALK CYCLE phase for the SAME headings: row1 neutral contact; row2 left forepaw forward/right hind forward; row3 opposite contact; row4 right forepaw forward/left hind forward. Clearly alternating lifted paws like the four walk images in the reference, no body drift. Preserve exactly consistent head/body proportions, character design, colors, golden eyes and scarf across ALL 32 sprites. Rear headings show back of head and NO face. All tails, paws, scarf stay wholly inside their cells. Highest-quality polished game-ready painted fantasy cat sprites. Keep eyes golden and scarf cyan, coat purple. No additional hats.
