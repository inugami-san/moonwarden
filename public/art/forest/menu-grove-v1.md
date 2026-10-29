# Moonwarden menu grove

Created 2026-10-28 with the built-in image-generation tool, not the CLI/API
fallback. This is a new opaque background painting, not a sprite atlas or UI
mockup. The original remains in the generated-images library. The project uses
`public/art/forest/menu-grove-v1.webp`: 1672 × 941, 251,574 bytes (~246 KiB),
encoded from the generated PNG with Sharp WebP quality 86/effort 6. No character,
text, menu controls or gameplay state is baked into the picture.

`app/home-backdrop.tsx` displays it only on HOME. `app/home-backdrop.css` adds
readability shading, transform/opacity-only mist and fourteen small drifting
spores. Motion respects the existing Pause animations setting and OS reduced
motion. Other menus retain their prior backgrounds. The interactive moon,
painted cat, appearance controls and Ordeal preview remain separate UI layers.

## Final generation prompt

Use case: stylized-concept. Asset type: production background painting for the Moonwarden fantasy social-deduction game's full-screen main menu, wide 16:9 landscape. Paint a luminous moonlit mushroom forest sanctuary: giant midnight-blue and indigo umbrella mushrooms with thick ancient twisting trunks, cyan bioluminescent gills and organic turquoise cap spots, mossy roots, fern clusters and small glowing mushrooms at the foreground edges. Layered misty woodland depth, distant blue mountain silhouettes between the trunks, cool silver moonlight from above, cozy wonder with a quiet hint of mystery. Rich hand-painted dimensional 2D game artwork with fine dark contours and restrained textured shading, matching a polished purple magical kitten game and its blue-cyan forest assets; not flat geometric SVG, not photorealistic. Composition for actual UI: keep the LEFT 45 percent low-contrast dark navy with soft atmospheric distant forest shapes, so cream menu text and gold buttons remain legible. Leave the center-right clearing around 72 percent horizontal / 58 percent vertical open for a separate large cat sprite to be drawn later, with subtle mossy ground and a low rounded stone below it. Frame the far right and bottom corners with the most detailed glowing foliage. Keep the top strip uncluttered for a navigation bar. Light shafts and mist only, no visible moon disk because the app renders an interactive moon separately. No characters, cats, creatures, user interface, buttons, text, logos, labels, star-diamond/sparkle symbols, or watermarks. Soft organic highlights, no overexposed neon and no black crushed detail. This is a finished background image only, edge to edge, no border.
