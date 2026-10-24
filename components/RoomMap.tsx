import { classRoomLabel, gradeOfRooms } from "@/lib/class-rooms";
import {
  CLUSTERS,
  CLUSTER_NAMES,
  ENTRANCE,
  FLOOR_PLANS,
  PLAN_HEIGHT,
  PLAN_WIDTH,
  clusterOf,
  floorName,
  type Cluster,
  type Floor,
  type Shape,
} from "@/lib/rooms";

const NUMBER_SIZE = 15;
const NAME_SIZE = 10;
const SMALL_NAME_SIZE = 8.5;
const PAD = 4;

/** Words wrapped to the width, or null when a word does not fit (then the name is left out). */
function wrap(text: string, width: number, size: number, maxLines: number) {
  const charWidth = size * 0.56;
  const lines: string[] = [];
  for (const word of text.split(" ")) {
    if (word.length * charWidth > width) {
      return null;
    }
    const last = lines.at(-1);
    if (last !== undefined && (last.length + 1 + word.length) * charWidth <= width) {
      lines[lines.length - 1] = `${last} ${word}`;
    } else {
      lines.push(word);
    }
  }
  return lines.length <= maxLines ? lines : null;
}

/** A small flight of stairs, like the sign on the printed plan. */
function StairsSign({ x, y }: { x: number; y: number }) {
  return (
    <path
      d={`M${x - 9} ${y + 7}h5v-5h5v-5h5v-5h4`}
      fill="none"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="stroke-foreground/55"
    />
  );
}

function Label({ shape, marked }: { shape: Shape; marked: boolean }) {
  const cx = shape.x + shape.w / 2;
  const cy = shape.y + shape.h / 2;
  const width = shape.w - PAD * 2;
  if (shape.kind === "stairs") {
    return <StairsSign x={cx} y={cy} />;
  }
  if (shape.kind === "wc" || shape.kind === "lift") {
    const text = shape.kind === "wc" ? "WC" : "Aufzug";
    return wrap(text, width, 9, 1) ? (
      <text x={cx} y={cy + 3} fontSize={9} textAnchor="middle" className="fill-muted">
        {text}
      </text>
    ) : null;
  }
  if (shape.kind !== "room" && shape.kind !== "space") {
    return null;
  }

  const numberSize = Math.min(NUMBER_SIZE, width / 1.75);
  const extra = [
    ...(shape.id ? [classRoomLabel(shape.id)].filter((label): label is string => label !== null) : []),
    ...(shape.name ? [shape.name] : []),
  ];
  // Below the number, as far as there is room: the class first, then the name.
  const room = shape.h - PAD * 2 - (shape.id ? numberSize + 2 : 0);
  const lines: { text: string; accent: boolean; size: number }[] = [];
  const used = () => lines.reduce((sum, line) => sum + line.size + 1, 0);
  for (const [index, text] of extra.entries()) {
    // Smaller if a long word ("Oberstufenraum") does not fit otherwise.
    for (const size of [NAME_SIZE, SMALL_NAME_SIZE]) {
      const free = Math.floor((room - used()) / (size + 1));
      const wrapped = free > 0 ? wrap(text, width, size, Math.min(free, 3)) : null;
      if (wrapped) {
        lines.push(...wrapped.map((line) => ({ text: line, accent: index === 0 && extra.length === 2, size })));
        break;
      }
    }
  }
  const total = (shape.id ? numberSize : 0) + used();
  let y = cy - total / 2;
  return (
    <>
      {shape.id ? (
        <text
          x={cx}
          y={(y += numberSize) - 2}
          fontSize={numberSize}
          fontWeight={700}
          textAnchor="middle"
          className={marked ? "fill-white" : "fill-foreground"}
        >
          {shape.id}
        </text>
      ) : null}
      {lines.map((line, index) => (
        <text
          key={index}
          x={cx}
          y={(y += line.size + 1) - 1}
          fontSize={line.size}
          fontWeight={line.accent ? 700 : 500}
          textAnchor="middle"
          className={marked ? "fill-white" : line.accent ? "fill-accent-strong" : "fill-muted"}
        >
          {line.text}
        </text>
      ))}
    </>
  );
}

const fills: Record<Shape["kind"], string> = {
  room: "fill-surface",
  space: "fill-surface",
  wc: "fill-surface-muted",
  lift: "fill-surface-muted",
  stairs: "fill-surface-muted",
  court: "fill-garden",
  blocked: "fill-foreground/12",
};

const clusterFills: Record<Cluster, string> = {
  "left-top": "fill-cluster-top",
  "right-top": "fill-cluster-top",
  "left-bottom": "fill-cluster-bottom",
  "right-bottom": "fill-cluster-bottom",
};

/** Room between rooms: each one a tile of its own. */
const GAP = 1.2;

/** A garden: open to the sky, a tree in it. */
function Garden({ shape }: { shape: Shape }) {
  const cx = shape.x + shape.w / 2;
  const cy = shape.y + shape.h / 2;
  return (
    <g className="fill-garden-ink">
      <circle cx={cx} cy={cy - 14} r={11} opacity={0.35} />
      <circle cx={cx - 8} cy={cy - 8} r={8} opacity={0.35} />
      <circle cx={cx + 8} cy={cy - 8} r={8} opacity={0.35} />
      <rect x={cx - 1.5} y={cy - 6} width={3} height={12} rx={1} opacity={0.55} />
      <text x={cx} y={cy + 22} fontSize={12} fontWeight={700} textAnchor="middle">
        Garten
      </text>
    </g>
  );
}

/** The name of a cluster above or below it, on a tag in its colour. */
function ClusterTag({ cluster, text }: { cluster: Cluster; text: string }) {
  const [side, half] = cluster.split("-");
  const x = side === "left" ? 220 : 780;
  const y = half === "top" ? -17 : PLAN_HEIGHT + 17;
  const width = text.length * 6.6 + 22;
  return (
    <g>
      <rect x={x - width / 2} y={y - 10} width={width} height={20} rx={10} className={`${clusterFills[cluster]} stroke-foreground/15`} />
      <text x={x} y={y + 4} fontSize={11.5} fontWeight={700} textAnchor="middle" className="fill-foreground">
        {text}
      </text>
    </g>
  );
}

/** One floor of the main building, the given rooms marked (those on this floor). */
export function RoomMap({ floor, marked, className }: { floor: Floor; marked: readonly string[]; className?: string }) {
  const shapes = FLOOR_PLANS[floor];
  const markedShapes = shapes.filter((shape) => shape.id && marked.includes(shape.id));
  const markedIds = markedShapes.map((shape) => shape.id!);
  const clusterNames = CLUSTERS.map((cluster) => {
    const ids = shapes.filter((shape) => shape.id && clusterOf(shape) === cluster).map((shape) => shape.id!);
    return [cluster, CLUSTER_NAMES[floor][cluster] ?? gradeOfRooms(ids)] as const;
  });
  return (
    <svg
      role="img"
      aria-label={`${floorName(floor)}${
        markedIds.length === 1 ? `, Raum ${markedIds[0]} markiert` : markedIds.length > 1 ? `, Räume ${markedIds.join(" und ")} markiert` : ""
      }`}
      viewBox={`-6 -32 ${PLAN_WIDTH + 12} ${PLAN_HEIGHT + 64}`}
      className={className}
      fontFamily="inherit"
    >
      <rect
        x={-3}
        y={-3}
        width={PLAN_WIDTH + 6}
        height={PLAN_HEIGHT + 6}
        rx={10}
        strokeWidth={2}
        className="fill-background-soft stroke-foreground/30"
      />
      {shapes.map((shape, index) => {
        const isMarked = markedShapes.includes(shape);
        const cluster = clusterOf(shape);
        const fill = cluster && (shape.kind === "room" || shape.kind === "space") ? clusterFills[cluster] : fills[shape.kind];
        return (
          <g key={index} data-room={shape.id}>
            <rect
              x={shape.x + GAP}
              y={shape.y + GAP}
              width={shape.w - GAP * 2}
              height={shape.h - GAP * 2}
              rx={shape.kind === "court" ? 10 : 3}
              strokeWidth={isMarked ? 2.5 : 1}
              className={
                isMarked
                  ? "fill-accent stroke-accent-strong"
                  : `${fill} ${shape.kind === "court" ? "stroke-garden-ink/25" : "stroke-foreground/20"}`
              }
            />
            {shape.kind === "court" ? <Garden shape={shape} /> : <Label shape={shape} marked={isMarked} />}
          </g>
        );
      })}
      {/* The middle: the stairwell (on the ground floor the foyer with the entrance). */}
      <text x={502} y={258} fontSize={11.5} fontWeight={700} textAnchor="middle" className="fill-muted">
        {floor === 0 ? "Foyer" : "Treppenhaus"}
      </text>
      {floor === 0 ? (
        <>
          {/* The entrance: an opening in the outer wall. */}
          <rect x={ENTRANCE.x + 2} y={PLAN_HEIGHT - 2} width={ENTRANCE.w - 4} height={8} className="fill-background-soft" />
          <text
            x={ENTRANCE.x + ENTRANCE.w / 2}
            y={PLAN_HEIGHT - 14}
            fontSize={13}
            fontWeight={700}
            textAnchor="middle"
            className="fill-muted"
          >
            Eingang ↑
          </text>
        </>
      ) : null}
      {clusterNames.map(([cluster, text]) => (text ? <ClusterTag key={cluster} cluster={cluster} text={text} /> : null))}
      {markedShapes.map((shape) => (
        <rect
          key={shape.id}
          x={shape.x - 5}
          y={shape.y - 5}
          width={shape.w + 10}
          height={shape.h + 10}
          rx={7}
          fill="none"
          strokeWidth={3}
          className="room-pulse stroke-accent"
        />
      ))}
    </svg>
  );
}
