"use client";

import { useId, useState } from "react";

const ORDEALS = [
  { icon: "✧", name: "Total Blackout", tag: "FOLLOW THE LIGHT", text: "The sanctuary goes dark. Keep your glowing mushroom close — and your friends closer.", tip: "Nearby light reveals hidden wardens.", tone: "night" },
  { icon: "≋", name: "Thick Sea Fog", tag: "WHO GOES THERE?", text: "Familiar faces become anonymous shapes. Remember who was beside you before the mist rolled in.", tip: "Colors, names, and accessories disappear in the fog.", tone: "mist" },
  { icon: "☼", name: "Moon Glare", tag: "TOO MUCH OF A GOOD THING", text: "The moon floods the glade with light. You can still see silhouettes, but not who they belong to.", tip: "Watch movement, not colors.", tone: "gold" },
  { icon: "⌘", name: "Rootwake", tag: "MIND YOUR LITTLE CORNER", text: "Living roots divide the sanctuary into sealed chambers. Your view is limited to the chamber you’re in.", tip: "Take note of who gets sealed in with you.", tone: "root" },
  { icon: "♧", name: "Phantom Procession", tag: "NOT EVERY SHAPE IS A FRIEND", text: "Wandering phantoms join the circle. Ring an Echo Bell to briefly distinguish illusions from real players.", tip: "A well-timed bell can clear up a very bad alibi.", tone: "ghost" },
  { icon: "◈", name: "Mirror Pool", tag: "A CASE OF MISTAKEN IDENTITY", text: "Bump into another warden and your colors swap. The disguise lingers until the next meeting.", tip: "Track names and movements — a color can lie.", tone: "pool" },
] as const;

/** Decorative code-native art: no downloads or per-frame React updates. */
export function HomeAtmosphere() {
  const forestId = `${useId().replace(/:/g, "")}-forest-pine`;
  return <div className="home-atmosphere" aria-hidden="true">
    <div className="home-aurora home-aurora-one" /><div className="home-aurora home-aurora-two" />
    <svg className="home-horizon" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMax slice">
      <defs><symbol id={forestId} viewBox="0 0 180 380">
        <path d="M83 200h14v180H83Z" fill="#716b8f" />
        <path d="M90 0Q68 53 38 94l22-1q-29 49-59 80l36-3q-33 49-64 77l39 1-32 52q54 31 110 31t110-31l-32-52 39-1q-31-28-64-77l36 3q-30-31-59-80l22 1Q112 53 90 0Z" fill="currentColor" />
        <path d="M90 24v283q-36-5-58-18l38-48-30-1 39-73-31 1 36-66-20 1Z" fill="#e6e4ff" opacity=".1" />
        <path d="M90 164v179m0-80-32-23m32-36 29-20" stroke="#e9e2ff" strokeWidth="2" opacity=".13" fill="none" />
      </symbol></defs>
      <path d="M0 440 175 165 350 420 550 240 760 490 1010 190 1210 410 1440 100 1600 380V1000H0Z" fill="#afb8d6" />
      <path d="M0 600Q220 390 440 560T850 520T1250 490T1600 530V1000H0Z" fill="#a0a8cc" />
      <g data-forest-layer="distant" opacity=".75">{Array.from({length:20},(_,i)=><use key={i} href={`#${forestId}`} x={i*88-60} y={260+(i*31)%110} width={110+(i%3)*20} height={260+(i%4)*20} style={{color:"#929ac1"}} />)}</g>
      <path d="M0 720Q200 590 420 725T880 670T1250 700T1600 650V1000H0Z" fill="#929dbf" />
      <g data-forest-layer="middle">{Array.from({length:15},(_,i)=><use key={i} href={`#${forestId}`} x={i*120-85} y={420+(i*43)%105} width={160+(i%3)*25} height={340+(i%3)*45} style={{color:i%2 ? "#7b86ad" : "#8993b6"}} />)}</g>
      <g data-forest-layer="near" opacity=".9">{[[-90,370,290,630],[55,525,240,530],[1190,475,260,550],[1400,300,330,700]].map(([x,y,width,height],i)=><use key={i} href={`#${forestId}`} x={x} y={y} width={width} height={height} style={{color:"#637299"}} />)}</g>
    </svg>
    <svg className="home-forest-floor" viewBox="0 0 1600 500" preserveAspectRatio="xMidYMax slice"><path d="M0 320Q400 240 800 340t800-40v200H0Z" fill="#9fa8c6" /><g data-forest-layer="floor">{Array.from({length:17},(_,i)=><use key={i} href={`#${forestId}`} x={i*106-90} y={30+(i*31)%100} width={155+(i%3)*20} height={380+(i%2)*80} style={{color:i%2 ? "#6d7a9c" : "#8390b0"}} />)}</g></svg>
    <div className="home-canopy"><i /><i /><i /></div>
    <div className="home-pollen">{Array.from({length:12},(_,i)=><i key={i} style={{"--seed":i,"--drift-x":`${(i*37)%100}%`,"--drift-y":`${(i*17)%90}%`} as React.CSSProperties} />)}</div>
  </div>;
}

export function HomeGrove() {
  const id = useId().replace(/:/g, "");
  return <svg className="home-grove" viewBox="0 0 700 750" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
    <defs>
      <linearGradient id={`${id}-sky`} x2=".3" y2="1"><stop stopColor="#242b50" /><stop offset=".6" stopColor="#62688e" /><stop offset="1" stopColor="#b2a3bd" /></linearGradient>
      <linearGradient id={`${id}-water`} x2="0" y2="1"><stop stopColor="#c6cbef" /><stop offset="1" stopColor="#596b9c" /></linearGradient>
      <linearGradient id={`${id}-pine`} x2="1" y2="1"><stop stopColor="#283c62" /><stop offset="1" stopColor="#586c8c" /></linearGradient>
      <radialGradient id={`${id}-glow`}><stop stopColor="#f5ddbc" stopOpacity=".5" /><stop offset="1" stopColor="#d7c5ff" stopOpacity="0" /></radialGradient>
    </defs>
    <path fill={`url(#${id}-sky)`} d="M0 0h700v750H0Z" />
    <circle fill={`url(#${id}-glow)`} cx="468" cy="220" r="220" />
    <g fill="#f1e9dc" opacity=".7">{Array.from({length:16},(_,i)=><circle key={i} cx={45+(i*83)%620} cy={28+(i*53)%215} r={i%4===0 ? 1.8 : .9} />)}</g>
    <path fill="#777fa2" d="m0 327 110-140 78 98 84-59 120 146 115-110 71 64 122-134v558H0Z" />
    <path fill="#d4d4e8" opacity=".65" d="m110 187-30 57 28-12 24 18 18-13Zm162 39-25 34 22-5 20 16 11-9Z" />
    <path fill="#626e94" d="M0 415q110-112 250-20t260-38q90-30 190 20v373H0Z" />
    <g fill="#4c5b80" opacity=".8">{Array.from({length:13},(_,i)=><path key={i} d="m0 0-24 56h10l-22 40h72L14 56h10Z" transform={`translate(${i*60-10} ${285+(i*37)%80}) scale(${.65+(i%3)*.18})`} />)}</g>
    <path fill="#a9afd1" opacity=".35" d="M0 391q190 50 350-5t350 16v23q-160-23-320 13T0 417Z" className="grove-mist" />
    <path fill="#3d5274" d="M0 540q140-155 370-30t330-39v279H0Z" />
    <ellipse cx="380" cy="643" rx="285" ry="136" fill="#536787" />
    <path d="M256 750q-25-65 66-90t-25-42q-47-26 15-39 109-17 168 7 65 33-37 65t34 99" fill={`url(#${id}-water)`} />
    <g fill="none" stroke="#e2d8f8" strokeWidth="2" opacity=".6" className="grove-water-lines"><path d="M313 601q63-16 111 0m-120 17q57-13 106-2m-71 48q38-13 76-6m-122 43q50-14 89-5" /></g>
    <ellipse cx="350" cy="550" rx="187" ry="74" fill="#5b6484" />
    <ellipse cx="350" cy="540" rx="181" ry="66" fill="#a5a0bb" />
    <ellipse cx="350" cy="540" rx="147" ry="47" fill="#898cae" />
    <g fill="none" stroke="#e4d2b8" opacity=".7"><ellipse cx="350" cy="540" rx="115" ry="34" /><path d="m350 509 25 30-25 31-25-31Z" /></g>
    {[[-34, 86, 1.25], [60, 190, .72], [112, 305, .52], [520, 290, .6], [582, 128, 1.04], [654, 242, .88]].map(([x, y, scale], i) => <g key={i} transform={`translate(${x} ${y}) scale(${scale})`}>
      <path d="M47 220h17v190q-9 8-17 0Z" fill="#5b5e79" />
      <path d="M55 0Q25 55 4 87l22 2q-24 45-52 70l40 3q-32 48-67 77 40 29 108 29t108-29q-35-29-67-77l40-3q-28-25-52-70l22-2Q85 55 55 0Z" fill={`url(#${id}-pine)`} />
      <path d="M55 19q-14 45-36 66l27 2-44 69 41 3-58 77q26 14 70 16Z" fill="#bcc8ed" opacity=".16" />
      <path d="M55 120v290m0-185-33-25m33-21 31-24" fill="none" stroke="#8190b1" strokeWidth="3" />
    </g>)}
    <g fill="#535b7b" stroke="#9c9cb4" strokeWidth="2"><path d="m156 564 15-28 24 1 14 25-22 9Z" /><path d="m501 556 13-22 29 6 5 24-30 4Z" /></g>
    <g fill="#e6dfa9"><path d="m182 550 2 10m-5-7 8 2m339-9 1 13m-6-9 11 4" /></g>
    {[[94, 574], [558, 593], [610, 655], [135, 688]].map(([x, y], i) => <g key={i} transform={`translate(${x} ${y})`} className="grove-mushroom">
      <path d="M-4 0h8v24q-4 7-8 0Z" fill="#f2edcc" />
      <path d="M-24 1q0-34 24-34T24 1q-24 10-48 0Z" fill={i % 2 ? "#e7c795" : "#c5c2ef"} />
      <circle cx="-8" cy="-12" r="4" fill="#fff9d9" /><circle cx="10" cy="-16" r="3" fill="#fff9d9" />
    </g>)}
    <g fill="#fff8c4"><path d="m170 213 3 9 9 3-9 3-3 9-3-9-9-3 9-3Z" /><path d="m521 105 3 9 9 3-9 3-3 9-3-9-9-3 9-3Z" /></g>
    <g stroke="#8f97bc" strokeWidth="2" fill="none"><path d="M54 750q5-52-15-77m16 60 26-31m554 48q-7-43 15-61m-16 38-20-23" /></g>
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
