"use client";

import { useState } from "react";

const ORDEALS = [
  { icon: "✧", name: "Total Blackout", tag: "FOLLOW THE LIGHT", text: "The sanctuary goes dark. Keep your glowing mushroom close — and your friends closer.", tip: "Nearby light reveals hidden wardens.", tone: "night" },
  { icon: "≋", name: "Thick Sea Fog", tag: "WHO GOES THERE?", text: "Familiar faces become anonymous shapes. Remember who was beside you before the mist rolled in.", tip: "Colors, names, and accessories disappear in the fog.", tone: "mist" },
  { icon: "☼", name: "Moon Glare", tag: "TOO MUCH OF A GOOD THING", text: "The moon floods the glade with light. You can still see silhouettes, but not who they belong to.", tip: "Watch movement, not colors.", tone: "gold" },
  { icon: "⌘", name: "Rootwake", tag: "MIND YOUR LITTLE CORNER", text: "Living roots divide the sanctuary into sealed chambers. Your view is limited to the chamber you’re in.", tip: "Take note of who gets sealed in with you.", tone: "root" },
  { icon: "♧", name: "Phantom Procession", tag: "NOT EVERY SHAPE IS A FRIEND", text: "Wandering phantoms join the circle. Ring an Echo Bell to briefly distinguish illusions from real players.", tip: "A well-timed bell can clear up a very bad alibi.", tone: "ghost" },
  { icon: "◈", name: "Mirror Pool", tag: "A CASE OF MISTAKEN IDENTITY", text: "Bump into another warden and your colors swap. The disguise lingers until the next meeting.", tip: "Track names and movements — a color can lie.", tone: "pool" },
] as const;

/** Decorative code-native art: no downloads or per-frame React updates. */
export function HomeGrove() {
  return <svg className="home-grove" viewBox="0 0 700 750" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
    <path fill="#b3d7c8" d="M0 300 116 170 244 329 370 201 540 353 700 221V750H0Z" />
    <path fill="#8fbead" d="M0 394 147 292 315 424 468 307 700 408V750H0Z" />
    <ellipse cx="350" cy="690" rx="470" ry="230" fill="#699d81" />
    <ellipse cx="350" cy="615" rx="280" ry="125" fill="#a9cfa0" />
    <ellipse cx="350" cy="585" rx="208" ry="76" fill="#cfdfaa" />
    {[[-30, 100, 1.2], [82, 220, .75], [580, 140, 1.05], [650, 230, .9]].map(([x, y, scale], i) => <g key={i} transform={`translate(${x} ${y}) scale(${scale})`}>
      <path d="M47 220h17v190H47Z" fill="#557e68" />
      <path d="m55 0-66 135h29l-47 91h36l-48 91h191l-48-91h36l-47-91h30Z" fill={i % 2 ? "#6c9f87" : "#508b76"} />
      <path d="M55 24v279H-27l48-83H1l42-84H24Z" fill="#a0c3a1" opacity=".22" />
    </g>)}
    <path d="M180 750q0-70 170-110t120-85q50 32-69 90t-69 105" fill="#e4e8b7" opacity=".65" />
    {[[94, 574], [558, 593], [610, 655], [135, 688]].map(([x, y], i) => <g key={i} transform={`translate(${x} ${y})`} className="grove-mushroom">
      <path d="M-4 0h8v24q-4 7-8 0Z" fill="#f2edcc" />
      <path d="M-24 1q0-34 24-34T24 1q-24 10-48 0Z" fill={i % 2 ? "#e7c795" : "#bfe7cf"} />
      <circle cx="-8" cy="-12" r="4" fill="#fff9d9" /><circle cx="10" cy="-16" r="3" fill="#fff9d9" />
    </g>)}
    <g fill="#f4efbb"><path d="m170 213 3 9 9 3-9 3-3 9-3-9-9-3 9-3Z" /><path d="m521 105 3 9 9 3-9 3-3 9-3-9-9-3 9-3Z" /></g>
  </svg>;
}

export function HomeFieldGuide() {
  const [selected, setSelected] = useState(0);
  const ordeal = ORDEALS[selected];
  return <section className="home-discover" aria-labelledby="discover-title">
    <div className="home-discover-heading"><div><span className="home-kicker">A LITTLE CHARM. A LITTLE CHAOS.</span><h2 id="discover-title">Nice forest. Strange things happen.</h2></div><p>Restore shrines, collect magical gear, and survive the moon’s changing moods. One of your friends has other plans.</p></div>
    <div className="home-field-guide">
      <div className="home-ordeal-menu" role="group" aria-label="Explore the six Ordeals">{ORDEALS.map((item, index) => <button key={item.name} type="button" aria-pressed={selected === index} aria-controls="home-ordeal-story" onClick={() => setSelected(index)}><span aria-hidden="true">{item.icon}</span>{item.name}<span aria-hidden="true">↗</span></button>)}</div>
      <article id="home-ordeal-story" className={`home-ordeal-story tone-${ordeal.tone}`} aria-live="polite" aria-atomic="true">
        <div className="ordeal-story-copy" key={ordeal.name}><span className="home-kicker">{ordeal.tag}</span><h3>{ordeal.name}</h3><p>{ordeal.text}</p><small>✦ {ordeal.tip}</small></div>
        <span className="ordeal-story-art" aria-hidden="true">{ordeal.icon}</span>
      </article>
    </div>
    <div className="home-game-loop">{[["01", "Gather your friends", "Create a room, share the code. AI can fill the spare spots."], ["02", "Protect the sanctuary", "Solve quick shrine puzzles and earn gear for the next Ordeal."], ["03", "Question the circle", "Discuss what you saw. Vote carefully. Trust is optional."]].map(([number, title, text]) => <div key={number}><span>{number}</span><h3>{title}</h3><p>{text}</p></div>)}</div>
  </section>;
}
