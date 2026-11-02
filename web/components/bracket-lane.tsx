import { useLayoutEffect, useRef, useState } from "react";
import type { Tree } from "@/views/events";
import type { ReactNode } from "react";
import type { Match } from "@/lib/data";

export function BracketLane({
  lane,
  renderSeries,
}: {
  lane: Tree["lanes"][number];
  renderSeries: (match: Match) => ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [paths, setPaths] = useState<string[]>([]);
  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const measure = () => {
      const origin = el.getBoundingClientRect();
      const cards = new Map(
        Array.from(el.querySelectorAll<HTMLElement>("[data-match-id]")).map(
          (n) => [n.dataset.matchId, n],
        ),
      );
      for (const node of cards.values())
        if (node?.dataset.slotId) cards.set(node.dataset.slotId, node);
      const next: string[] = [];
      for (const round of lane.rounds)
        for (const match of round.matches) {
          const target = cards.get(match.slot_id || match.match_id)?.getBoundingClientRect();
          if (!target) continue;
          for (const id of match.feeds_from || []) {
            const source = cards.get(id)?.getBoundingClientRect();
            if (!source || source.right >= target.left) continue;
            const x1 = source.right - origin.left,
              x2 = target.left - origin.left,
              y1 = source.top + source.height / 2 - origin.top,
              y2 = target.top + target.height / 2 - origin.top;
            const mid = (x1 + x2) / 2;
            next.push(`M ${x1} ${y1} H ${mid} V ${y2} H ${x2}`);
          }
        }
      setPaths(next);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    for (const child of el.querySelectorAll(".series")) observer.observe(child);
    measure();
    return () => observer.disconnect();
  }, [lane]);
  return (
    <section className="bracket-lane">
      <h3>{lane.label}</h3>
      <div className="bracket-rounds" ref={root}>
        <svg className="bracket-connectors" aria-hidden="true">
          {paths.map((d, i) => (
            <path key={i} d={d} />
          ))}
        </svg>
        {lane.rounds.map((r) => (
          <section className="bracket-round" key={r.id}>
            <h4>{r.label}</h4>
            <div className="bracket-series">
              {r.matches.map((m, i) => (
                <div key={m.slot_id || m.match_id || i}>{renderSeries(m)}</div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </section>
  );
}
