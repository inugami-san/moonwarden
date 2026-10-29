# Celestial shrine atlas

Created with the built-in image generator on 2026-10-27 from the user's shrine
reference. Final project asset: `celestial-shrines-v1.png` (1536×1024 RGBA).
Three columns: sundial, cat basin, totem. Two rows: inactive, activated.
Original alpha retained. Runtime registration ignores soft glow when finding
the stone base, aligns both states to the same ground and caches halo textures.

## Generation prompt

Use case: stylized-concept. Asset type: production transparent 2.5D shrine sprite
atlas for Moonwarden game. Input is a visual design reference only. Closely match
its high quality hand-painted shapes, indigo moonstone, crisp dark ink, gold
accents and cool bioluminescence. Create exactly SIX separate complete game props
arranged in a perfectly regular THREE COLUMN by TWO ROW grid on genuinely
TRANSPARENT background. All six sprites centered in equally sized cells with
large clear transparent gutters. TOP ROW all inactive; BOTTOM ROW activated same
objects, same camera, same relative size and same ground baseline in corresponding
columns. Column1 CELESTIAL SUNDIAL: circular stepped dark-purple stone dais with
tiny front stairs, golden armillary orbital rings framing a crescent moon,
inactive rings tilted upward; activated rings settle horizontal around luminous
hovering crescent and compact pale-cyan light shaft rising above it with small
sparkles. Column2 WEEPING MOON-BASIN: carved seated cat statue left/back of a curved
bowl, thorny vines around stone base, inactive dry dark basin with no water/light;
active has cyan moonwater streaming from cat into basin, overflow ribbon cascading
over bowl edge, thin glowing teal vine runes and a few star motes. Column3
FOUR-PHASE TOTEM: narrow square tower made of four distinct stacked rune cubes,
indigo/teal stone, crescent topper and short plinth; inactive runes dark, active
each cube glows violet/green/cyan/rose and a warm little spirit flame crowns it.
Keep outlines and base structure consistent between each top/bottom pair, not a
perspective change. Visible top surfaces, 2.5D angled view matching reference,
NOT orthographic icon. Station objects only, NO characters standing next to them.
No text, no labels, no arrows, no panels, no grid lines, no white/beige backdrop,
no shadows joining neighboring cells, no extra duplicate props. Each sprite
entirely inside its own cell including beam/sparkles, leave minimum10% clear
padding. Overall atlas rectangular landscape ratio3:2. Exactly3columns2rows.
Preserve alpha transparency.
