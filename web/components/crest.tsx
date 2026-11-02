import { useEffect, useState } from "react";

export function Crest({ name, src }: { name: string; src?: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  const initials = name
    .split(/\s+/)
    .map((s) => s[0])
    .join("")
    .slice(0, 3)
    .toUpperCase();
  // Original artwork is never flattened into a monochrome rectangle.
  return (
    <span className="crest" aria-hidden="true">
      {src && !failed ? (
        <img
          src={src.startsWith("./") ? "/" + src.slice(2) : src}
          alt=""
          onError={() => setFailed(true)}
          loading="lazy"
          referrerPolicy="no-referrer"
        />
      ) : (
        <span>{initials}</span>
      )}
    </span>
  );
}
